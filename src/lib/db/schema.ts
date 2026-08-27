import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  uuid,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Content hierarchy: Library -> Book -> Chapter -> Topic -> Concept
// Canonical content. Never overwritten by generated artifacts (handoff §11).
// ---------------------------------------------------------------------------

export const books = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // e.g. "ddia"
  title: text("title").notNull(),
  author: text("author"),
});

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookId: uuid("book_id").notNull().references(() => books.id),
  number: integer("number").notNull(),
  title: text("title").notNull(),
});

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  chapterId: uuid("chapter_id").notNull().references(() => chapters.id),
  title: text("title").notNull(),
});

export const concepts = pgTable("concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  slug: text("slug").notNull().unique(), // e.g. "replication_lag" — stable key used by the AI pipeline
  title: text("title").notNull(),
  sourceChunk: text("source_chunk"), // minimum relevant book excerpt for context assembly (handoff §8.3)
  prerequisites: jsonb("prerequisites").$type<string[]>().default([]), // concept slugs
});

// ---------------------------------------------------------------------------
// Generated content: Experience / ExperienceStage
// One Experience is shared across all learners in the same personalization
// bucket (see experience_spec_replication_lag.md §4) — content, not per-user.
// ---------------------------------------------------------------------------

export const experienceStatus = pgEnum("experience_status", [
  "draft",
  "validated",
  "published",
]);

export const experiences = pgTable(
  "experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id").notNull().references(() => concepts.id),
    contractVersion: text("contract_version").notNull(),
    personalizationBucket: text("personalization_bucket").notNull(), // e.g. "detailed/2"
    title: text("title").notNull(),
    status: experienceStatus("status").notNull().default("draft"),
    // The free-text request that produced this variant ("explain like I'm a
    // junior engineer", a custom instruction, ...) — null for the canonical
    // experience. Lets the UI label versions meaningfully instead of just
    // showing an opaque bucket string.
    generationRequest: text("generation_request"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("experience_bucket_idx").on(
      t.conceptId,
      t.contractVersion,
      t.personalizationBucket
    ),
  ]
);

export const stageType = pgEnum("stage_type", [
  "mental_model",
  "visualization",
  "explanation",
  "example",
  "simulation",
  "decision",
  "consequence",
  "assessment",
  "mastery_update",
]);

export const generatedBySource = pgEnum("generated_by_source", [
  "gemini",
  "engine",
  "computed",
]);

export const experienceStages = pgTable(
  "experience_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experienceId: uuid("experience_id").notNull().references(() => experiences.id),
    order: integer("order").notNull(),
    type: stageType("type").notNull(),
    generatedBy: generatedBySource("generated_by").notNull(),
    payload: jsonb("payload").notNull(), // shape depends on `type` — see lib/ai/schemas.ts
  },
  (t) => [uniqueIndex("stage_order_idx").on(t.experienceId, t.order)]
);

// Reusable simulation scenario config, decoupled from the stage row so the
// deterministic engine can be replayed without re-fetching stage payload.
export const scenarioConfigs = pgTable("scenario_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id").notNull().references(() => experienceStages.id),
  payload: jsonb("payload").notNull(),
});

// ---------------------------------------------------------------------------
// Learners
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role"),
  experienceLevel: text("experience_level"), // junior | mid | senior
  goal: text("goal"),
  preferredExplanationStyle: text("preferred_explanation_style"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-user, per-Experience progress. The only per-user row for a *published*
// Experience — the content itself is shared (see spec §6).
export const userExperienceAttempts = pgTable(
  "user_experience_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    experienceId: uuid("experience_id").notNull().references(() => experiences.id),
    currentStageOrder: integer("current_stage_order").notNull().default(0),
    decisions: jsonb("decisions").$type<Record<string, string>>().default({}),
    answers: jsonb("answers").$type<Record<string, unknown>>().default({}),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [uniqueIndex("attempt_user_experience_idx").on(t.userId, t.experienceId)]
);

export const conceptMastery = pgTable(
  "concept_mastery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    conceptId: uuid("concept_id").notNull().references(() => concepts.id),
    masteryPct: real("mastery_pct").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    mistakes: integer("mistakes").notNull().default(0),
    revisionHistory: jsonb("revision_history").$type<
      { at: string; masteryPct: number; source: string }[]
    >().default([]),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mastery_user_concept_idx").on(t.userId, t.conceptId)]
);

// Versioned, provenance-tagged learner facts (handoff §10). Append-only —
// never overwrite; a new row supersedes but the old one is retained.
export const learnerFacts = pgTable("learner_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  source: text("source").notNull(), // "user" | "model"
  confidence: real("confidence"), // only set when source = "model"
  version: integer("version").notNull(),
  previousValue: jsonb("previous_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-user, per-experience chat — "ask about this concept" grounded in the
// experience's own generated content (mental model/explanation/example) and
// the real book excerpt, not the model's unscoped general knowledge.
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);

export const experienceChatMessages = pgTable("experience_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  experienceId: uuid("experience_id").notNull().references(() => experiences.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: chatRole("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
