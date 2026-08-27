# Interactive Technical Learning Platform

Vercel-hosted Next.js app (React + shadcn frontend, API routes backend) on Neon Postgres, with generated learning content produced by Gemini and rendered as living diagrams via [Markdy](https://markdy.com).

This scaffold is the vertical slice for the `replication_lag` concept described in `../experience_spec_replication_lag.md`. Read that doc first — it's the contract this code implements.

## Stack

- **Frontend**: Next.js App Router, React, Tailwind, shadcn/ui.
- **Backend**: Next.js API routes (same repo/deploy as the frontend, per the brief).
- **DB**: Neon Postgres via Drizzle ORM (`src/lib/db/schema.ts`).
- **AI orchestration**: LangGraph (`src/lib/ai/pipeline.ts`) — Context Builder → Gemini → layered validation → persist, as a state graph rather than a linear function. This is what makes a failed generation retry *with feedback* at the exact failed step, and keeps every run's state (context sent, raw model output, which validators failed) inspectable instead of implicit in a call stack.
- **Visuals**: `@markdy/renderer-dom`, wrapped in `src/components/experience/markdy-diagram.tsx`.

## Why LangGraph here specifically

The generation pipeline is a graph, not a chain, because two things the spec requires don't fit a single linear pass:

1. **Retry-with-feedback, not retry-from-scratch.** `validate` fails → back to `generate`, but the model sees its own bad output plus the specific validator errors, not a blank prompt. `src/lib/ai/pipeline.ts`'s `shouldRetry` conditional edge does this, capped at `MAX_ATTEMPTS`.
2. **Every run's state is a typed, resumable object** (`context`, `rawOutput`, `parsed`, `errors`, `attempt`, `status`) rather than local variables inside one function — so a failed run can be logged, inspected, or (in a fuller build) resumed from the node it failed on instead of re-running the whole thing.

## Content model ↔ Markdy: text vs. animation is a per-stage decision

Not every stage is a diagram. `mental_model`/`explanation` are pure prose (no Markdy at all); `visualization`/`simulation` are diagram-first with a line or two of supporting text; `decision`/`consequence` are short prompts; `assessment` is a quiz. `ExperiencePlayer` (`src/components/experience/experience-player.tsx`) renders each stage type with its own layout instead of forcing one text+diagram template on all of them — that's deliberate, matching "sometimes more text, sometimes more animations."

The bundled `UI mockups requested.zip` prototype is a **reference for layout/flow**, not the source of truth — this build follows the Experience spec's stage contract first and borrows the mockup's visual language (stepper, teal/coral accents, cached badge) where it doesn't conflict.

## What's deliberately NOT here yet

Per handoff §16 ("avoid premature scope"): no auth, no multi-book ingestion, no production infra. One seeded demo user, one seeded concept, one seeded Experience. The `/api/experiences/generate` route and the "Explain differently" drawer are the only things that call Gemini — everything else is a DB read.

## Setup

```bash
cp .env.example .env.local   # fill in DATABASE_URL (Neon) and GEMINI_API_KEY
npm install
npm run db:push              # push the Drizzle schema to Neon
npm run seed                 # seed DDIA / Ch.5 / Leaders and Followers / Replication Lag
npm run dev
```

Then open `/` — it lists the seeded Experience and links to `/experience/[id]`, which renders with `CACHED · INSTANT LOAD` (no Gemini call). Use the "Explain differently" drawer inside the Mastery stage to exercise the live generation pipeline (requires `GEMINI_API_KEY`).

## Layout

```
src/lib/db/schema.ts          content hierarchy + generated content + learner tables
src/lib/ai/schemas.ts         Generation Contract + per-stage zod schemas
src/lib/ai/context-builder.ts assembles the 7 context categories (handoff §8) per request
src/lib/ai/gemini.ts          the only module that talks to the model
src/lib/ai/markdy-validate.ts deterministic MarkdyScript hallucination-guard checks
src/lib/ai/pipeline.ts        LangGraph state machine tying the above together
src/lib/ai/persist.ts         writes validated output; adds computed consequence/mastery stages
src/lib/ai/mastery.ts         deterministic mastery formula — never LLM-scored
src/components/experience/    MarkdyDiagram renderer + the stage-by-stage player UI
```
