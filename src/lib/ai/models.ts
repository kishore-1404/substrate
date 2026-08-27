import * as gemini from "./providers/gemini";
import * as openrouter from "./providers/openrouter";
import type { LlmProviderName } from "./llm";

export interface AvailableModel {
  id: string;
  label: string;
}

// "Show only available models" means live-checked, not a static catalog —
// verified against this exact scenario: free-tier OpenRouter models share a
// contended upstream pool, so a model can be in the catalog and still be
// 429-ing right now. Probe every candidate with a trivial real request in
// parallel and only return the ones that actually answered.
//
// Cached briefly per provider — every candidate probe is a real API call,
// and re-probing 20-30 models on every settings-panel open would burn
// quota for no benefit within the same minute.
const CACHE_TTL_MS = 60_000;
const cache = new Map<LlmProviderName, { at: number; models: AvailableModel[] }>();

// Promise.allSettled waits for EVERY promise to settle — one straggler
// model with no timeout of its own (found in practice: a handful of Gemini
// models took 40s+ on a real run) blocks the whole probe batch and, with
// it, the settings UI. Cap each individual probe so one slow model can't
// hold up the rest.
const PROBE_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms)),
  ]);
}

export async function listAvailableModels(provider: LlmProviderName): Promise<AvailableModel[]> {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.models;

  const impl = provider === "openrouter" ? openrouter : gemini;
  const ids = await impl.listModelIds();

  const results = await Promise.allSettled(
    ids.map(async (id) => ({ id, ok: await withTimeout(impl.probeModel(id), PROBE_TIMEOUT_MS) }))
  );
  const available = results
    .filter((r): r is PromiseFulfilledResult<{ id: string; ok: boolean }> => r.status === "fulfilled" && r.value.ok)
    .map((r) => r.value.id);

  const models = available.map((id) => ({ id, label: labelFor(provider, id) })).sort((a, b) => a.label.localeCompare(b.label));
  cache.set(provider, { at: Date.now(), models });
  return models;
}

function labelFor(provider: LlmProviderName, id: string): string {
  if (provider === "gemini") return id.replace(/^gemini-/, "Gemini ").replace(/-/g, " ");
  // OpenRouter ids look like "nvidia/nemotron-3-super-120b-a12b:free"
  const [, name] = id.split("/");
  return (name ?? id).replace(/:free$/, "").replace(/-/g, " ");
}
