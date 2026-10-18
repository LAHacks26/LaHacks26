import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One postgres pool per process. Cached on globalThis so Next dev hot reloads
// reuse it instead of opening new connections.
const globalForDb = globalThis as unknown as {
  __saffronSql?: ReturnType<typeof postgres>;
  __saffronDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getDb() {
  if (globalForDb.__saffronDb) return globalForDb.__saffronDb;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql =
    globalForDb.__saffronSql ??
    postgres(url, {
      ssl: "require",
      max: 5,
      prepare: false,
    });

  const db = drizzle(sql, { schema });

  globalForDb.__saffronSql = sql;
  globalForDb.__saffronDb = db;
  return db;
}

export type Db = ReturnType<typeof getDb>;
