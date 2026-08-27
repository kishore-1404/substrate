"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface AvailableModel {
  id: string;
  label: string;
}

const PROVIDERS = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
] as const;

export function ModelSettingsSheet({
  open,
  onOpenChange,
  currentProvider,
  currentModel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentProvider: string;
  currentModel: string | null;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<"gemini" | "openrouter">(currentProvider === "openrouter" ? "openrouter" : "gemini");
  const [model, setModel] = useState(currentModel ?? "");
  const [models, setModels] = useState<AvailableModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    // Reset + fetch inside an async body, not the effect body itself, so
    // these setState calls aren't the synchronous-in-effect pattern React
    // flags — this is a genuine "fetch external data on dependency change"
    // effect, the documented case where that's expected.
    (async () => {
      setModels(null);
      setLoadingModels(true);
      const res = await fetch(`/api/settings/models?provider=${provider}`);
      const json = await res.json();
      if (ignore) return;
      setModels(json.models ?? []);
      setLoadingModels(false);
    })();
    return () => {
      ignore = true;
    };
  }, [open, provider]);

  async function save() {
    if (!model) return;
    setSaving(true);
    try {
      await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Model</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Host</label>
            <div className="flex rounded-lg border p-1">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    setModel("");
                  }}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    provider === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Model {loadingModels && "— checking what's actually available right now…"}
            </label>
            {loadingModels ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 w-full animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : models && models.length > 0 ? (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm capitalize transition-colors ${
                      model === m.id ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary/50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No models responding right now for this provider — try again shortly, or switch host.
              </p>
            )}
          </div>

          <Button disabled={!model || saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
