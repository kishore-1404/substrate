import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // markdy-spec.md is read via fs at runtime (gemini.ts), not imported, so
  // Next's file tracing won't pick it up automatically for the Vercel
  // serverless bundle without this. Every route that imports gemini.ts
  // needs an entry here — the module-level fs.readFileSync runs for any of
  // them, not just the one that happens to call generateExperience.
  outputFileTracingIncludes: {
    "/api/experiences/generate": ["./src/lib/ai/markdy-spec.md"],
    "/api/experiences/[id]/chat": ["./src/lib/ai/markdy-spec.md"],
  },
};

export default nextConfig;
