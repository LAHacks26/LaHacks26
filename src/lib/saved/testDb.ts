// Test-only scripted driver: compile actual Drizzle SQL without connecting to Postgres.
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import * as schema from "../db/schema";

export function testDb() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const replies: (unknown[][] | Error)[] = [];
  const transactions: string[] = [];
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe(query: string, params: unknown[]) {
      calls.push({ sql: query, params });
      const reply = replies.shift();
      const result = () => {
        if (reply === undefined) return Promise.reject(new Error(`Unexpected query: ${query}`));
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      };
      return { values: result, then: (...args: Parameters<Promise<unknown[][]>["then"]>) => result().then(...args) };
    },
    async begin<T>(work: (connection: object) => Promise<T>): Promise<T> {
      transactions.push("begin");
      try {
        const result = await work(client);
        transactions.push("commit");
        return result;
      } catch (error) {
        transactions.push("rollback");
        throw error;
      }
    },
  };
  return { db: drizzle(client as unknown as Sql, { schema }), calls, replies, transactions };
}
