// Neon's HTTP driver can transiently fail — most commonly a cold-start
// after the compute has auto-suspended from idle — surfacing as a plain
// `TypeError: fetch failed` with no retry of its own. A single retry with a
// short backoff absorbs that without the caller needing to know about it.
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 300): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
