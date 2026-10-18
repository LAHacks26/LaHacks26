// Read-only connectivity/schema probe. Never prints connection details or errors.
// Usage: node scripts/check-db-connectivity.mjs [env-file]
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
import postgres from "postgres";

const SAFE_CODES = /^(?:[A-Z0-9]{5}|PROBE_TIMEOUT|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_DESTROYED|CONNECTION_ENDED|ERR_INVALID_URL|ENOENT|EACCES|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)$/;

/** Injectable dependencies let redaction/readonly behavior be tested without a connection. */
export async function probeDatabase({
  envFile = ".env.local",
  load = async (path) => parse(await readFile(path)),
  connect = postgres,
  timeoutMs = 6000,
} = {}) {
  let sql;
  let deadline;
  let expired = false;
  try {
    const operation = (async () => {
      const env = await load(envFile);
      if (expired) throw Object.assign(new Error("Probe timed out"), { code: "PROBE_TIMEOUT" });
      if (!env.DATABASE_URL) return { missing: true };
      const url = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
        throw Object.assign(new Error("Invalid database URL"), { code: "ERR_INVALID_URL" });
      }
      // postgres.js applies URL startup parameters after connection options. Strip them,
      // so no supplied options/statement_timeout can disable our read-only/time bounds.
      url.search = "";
      sql = connect(url.toString(), {
        ssl: "require",
        max: 1,
        prepare: false,
        fetch_types: false,
        connect_timeout: 5,
        onnotice: () => {},
        connection: { default_transaction_read_only: "on", statement_timeout: 5000 },
      });
      return sql.begin("read only", async (tx) => {
        const [row] = await tx`
          SELECT 1 AS ok,
            current_setting('transaction_read_only') = 'on' AS read_only,
            to_regclass('public.users') IS NOT NULL AS users,
            to_regclass('public.source_recipes') IS NOT NULL AS source_recipes,
            to_regclass('public.saved_recipes') IS NOT NULL AS saved_recipes,
            to_regclass('public.chat_messages') IS NOT NULL AS chat_messages
        `;
        return row;
      });
    })();
    const result = await Promise.race([operation, new Promise((_, reject) => {
      deadline = setTimeout(() => {
        expired = true;
        reject(Object.assign(new Error("Probe timed out"), { code: "PROBE_TIMEOUT" }));
      }, timeoutMs);
    })]);
    if (result.missing) return { connected: false, code: "DATABASE_URL_MISSING" };
    if (result.read_only !== true) return { connected: false, code: "READ_ONLY_NOT_CONFIRMED" };
    return { connected: result.ok === 1, readOnly: result.read_only,
      tables: { users: result.users, sourceRecipes: result.source_recipes,
        savedRecipes: result.saved_recipes, chatMessages: result.chat_messages } };
  } catch (error) {
    const code = typeof error?.code === "string" && SAFE_CODES.test(error.code)
      ? error.code : "CONNECTIVITY_FAILED";
    return { connected: false, code };
  } finally {
    clearTimeout(deadline);
    let cleanupDeadline;
    try {
      // Force this probe's dedicated pool closed even when its established connection stalls.
      await Promise.race([sql?.end({ timeout: 0 }), new Promise((resolve) => { cleanupDeadline = setTimeout(resolve, 1000); })]);
    } catch { /* Cleanup errors must also stay redacted. */ }
    finally { clearTimeout(cleanupDeadline); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await probeDatabase({ envFile: process.argv[2] || ".env.local" });
  console.log(JSON.stringify(result));
  if (!result.connected) process.exitCode = 1;
}
