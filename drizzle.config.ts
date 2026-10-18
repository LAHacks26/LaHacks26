import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// .env.local wins over .env. Missing DATABASE_URL must not throw here, so
// `db:generate` works without a database.
config({ path: ".env.local" });
config();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
