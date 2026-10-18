import { test } from "node:test";
import assert from "node:assert/strict";
import { probeDatabase } from "./check-db-connectivity.mjs";
import postgres from "postgres";

const testUrl = "postgres://localhost/saffron_probe_test";

test("the probe enforces read-only settings before inspecting schema metadata", async () => {
  let ended = false;
  const result = await probeDatabase({
    load: async () => ({ DATABASE_URL: testUrl }),
    connect: (_url, options) => {
      assert.equal(options.ssl, "require");
      assert.equal(options.fetch_types, false);
      assert.equal(options.connect_timeout, 5);
      assert.equal(options.connection.default_transaction_read_only, "on");
      assert.equal(options.connection.statement_timeout, 5000);
      return {
        begin: async (mode, run) => {
          assert.equal(mode, "read only");
          return run(async (template) => {
            const query = template.join("");
            assert.match(query, /SELECT 1/);
            assert.match(query, /to_regclass/);
            assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
            return [{ ok: 1, read_only: true, users: true, source_recipes: true, saved_recipes: true, chat_messages: true }];
          });
        },
        end: async () => { ended = true; },
      };
    },
  });
  assert.equal(result.connected, true);
  assert.equal(result.readOnly, true);
  assert.equal(ended, true);
});

test("missing configuration never attempts a connection", async () => {
  const result = await probeDatabase({ load: async () => ({}), connect: () => assert.fail("Unexpected connection") });
  assert.deepEqual(result, { connected: false, code: "DATABASE_URL_MISSING" });
});

test("file and constructor errors cannot expose raw configuration", async () => {
  const failure = Object.assign(new Error("sensitive configuration must stay private"), { code: "ERR_INVALID_URL", input: "private input" });
  for (const dependencies of [
    { load: async () => { throw failure; } },
    { load: async () => ({ DATABASE_URL: testUrl }), connect: () => { throw failure; } },
    { load: async () => ({ DATABASE_URL: "private input" }) },
  ]) {
    const result = await probeDatabase(dependencies);
    assert.deepEqual(result, { connected: false, code: "ERR_INVALID_URL" });
    assert.doesNotMatch(JSON.stringify(result), /sensitive|private input/);
  }
});

test("query errors expose only safe codes, and cleanup cannot expose errors", async () => {
  const result = await probeDatabase({
    load: async () => ({ DATABASE_URL: testUrl }),
    connect: () => ({
      begin: async () => { throw Object.assign(new Error("private server error"), { code: "unknown-private-text" }); },
      end: async () => { throw new Error("private cleanup error"); },
    }),
  });
  assert.deepEqual(result, { connected: false, code: "CONNECTIVITY_FAILED" });
});

test("URL startup options cannot disable read-only mode or query timeout", async () => {
  let driver;
  const result = await probeDatabase({
    load: async () => ({ DATABASE_URL: `${testUrl}?default_transaction_read_only=off&statement_timeout=0&options=-c%20statement_timeout%3D0` }),
    connect: (url, options) => {
      assert.equal(new URL(url).search, "");
      // Inspect the installed driver's real option precedence without sending a query.
      driver = postgres(url, options);
      assert.equal(driver.options.connection.default_transaction_read_only, "on");
      assert.equal(driver.options.connection.statement_timeout, 5000);
      assert.equal(driver.options.connection.options, undefined);
      return { begin: async () => ({ ok: 1, read_only: true }), end: (options) => driver.end(options) };
    },
  });
  assert.equal(result.connected, true);
});

test("an established but stalled query hits the wall-clock deadline and forces cleanup", async () => {
  let cleanupOptions;
  const result = await probeDatabase({
    timeoutMs: 5,
    load: async () => ({ DATABASE_URL: testUrl }),
    connect: () => ({
      begin: () => new Promise(() => {}),
      end: async (options) => { cleanupOptions = options; },
    }),
  });
  assert.deepEqual(result, { connected: false, code: "PROBE_TIMEOUT" });
  assert.deepEqual(cleanupOptions, { timeout: 0 });
});

test("late configuration loading after the deadline cannot initiate a connection", async () => {
  let complete;
  let connected = false;
  const result = await probeDatabase({
    timeoutMs: 5,
    load: () => new Promise((resolve) => { complete = resolve; }),
    connect: () => { connected = true; assert.fail("Late connection"); },
  });
  assert.equal(result.code, "PROBE_TIMEOUT");
  complete({ DATABASE_URL: testUrl });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connected, false);
});

test("the probe fails closed if the server does not confirm its read-only transaction", async () => {
  const result = await probeDatabase({
    load: async () => ({ DATABASE_URL: testUrl }),
    connect: () => ({ begin: async () => ({ ok: 1, read_only: false }), end: async () => {} }),
  });
  assert.deepEqual(result, { connected: false, code: "READ_ONLY_NOT_CONFIRMED" });
});
