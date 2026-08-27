import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // markdy-spec.md is read via fs at runtime (lib/ai/prompts.ts), not
  // imported, so Next's file tracing isn't guaranteed to pick it up for the
  // Vercel serverless bundle without this — local `next build` traced it in
  // automatically for one of these three routes and not the others (likely
  // a heuristic on the fs.readFileSync call shape, not something to rely
  // on), so every route that transitively imports prompts.ts gets an
  // explicit entry rather than trusting that detection to hold on Vercel's
  // build.
  outputFileTracingIncludes: {
    "/api/experiences/generate": ["./src/lib/ai/markdy-spec.md"],
    "/api/experiences/[id]/chat": ["./src/lib/ai/markdy-spec.md"],
    "/api/settings/models": ["./src/lib/ai/markdy-spec.md"],
  },
};

export default nextConfig;
