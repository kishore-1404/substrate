import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI only auto-loads `.env`; Next.js convention is
// `.env.local`, so load it explicitly (without overriding real env vars).
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
