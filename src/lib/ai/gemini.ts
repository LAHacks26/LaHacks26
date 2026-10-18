import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { z } from "zod";
import { toGeminiSchema } from "./jsonSchema";

export { toGeminiSchema } from "./jsonSchema";

export type AiErrorCode = "config" | "timeout" | "overloaded" | "invalid" | "failed" | "not_recipe";

/** Typed failure from the AI layer. `message` is short and safe to show to users. */
export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(message: string, code: AiErrorCode) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

type Tier = "fast" | "smart";
type ThinkingLevelName = "low" | "medium" | "high";

const DEFAULT_TIMEOUT_MS: Record<Tier, number> = { fast: 10_000, smart: 30_000 };
const EMBED_TIMEOUT_MS = 10_000;
const EMBED_DIMS = 768;

const THINKING_LEVEL: Record<ThinkingLevelName, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function models() {
  return {
    fast: process.env.GEMINI_FAST_MODEL || "gemini-3.6-flash",
    smart: process.env.GEMINI_SMART_MODEL || "gemini-3.6-flash",
    fallback: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash",
    embed: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
  };
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new AiError("The AI service is not configured.", "config");
    // The SDK retries 5 times by default. Turn that off so retries (and their latency) happen only in generateJson.
    client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  }
  return client;
}

/** Status code from an SDK ApiError (or any error that carries one). */
function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err && typeof err.status === "number") {
    return err.status;
  }
  return undefined;
}

/**
 * A 429 or 503 means overloaded. With no HTTP status, only an explicit overload message counts.
 * Any other status (400, 404, ...) is a plain failure.
 */
function isOverloaded(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined) return status === 429 || status === 503;
  const message = err instanceof Error ? err.message : "";
  return /overloaded|RESOURCE_EXHAUSTED/i.test(message);
}

/** Logs the model, HTTP status and error class only. Never the message or body, which may echo request data. */
function logFailure(model: string, err: unknown): void {
  console.error("[ai]", model, statusOf(err), err instanceof Error ? err.name : typeof err);
}

function toAiError(err: unknown, model: string): AiError {
  if (err instanceof AiError) return err;
  logFailure(model, err);
  if (isOverloaded(err)) return new AiError("The AI service is busy. Try again in a moment.", "overloaded");
  return new AiError("The AI request failed. Try again.", "failed");
}

/**
 * Runs `run` with an abort signal, and rejects with a timeout AiError if it takes longer than `ms`.
 * The race guarantees the timeout even if the SDK ignores the signal.
 */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiError("The AI request timed out. Try again.", "timeout"));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export type GenerateJsonOptions<T> = {
  schema: z.ZodType<T>;
  /** Pre-built Gemini schema. Defaults to `toGeminiSchema(schema)`. */
  geminiSchema?: object;
  system: string;
  prompt: string;
  tier: Tier;
  thinkingLevel?: ThinkingLevelName;
  timeoutMs?: number;
};

async function callModel(
  model: string,
  opts: { system: string; geminiSchema: object; thinkingLevel?: ThinkingLevelName },
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  return withTimeout(async (signal) => {
    const response = await getClient().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: opts.geminiSchema,
        thinkingConfig: opts.thinkingLevel ? { thinkingLevel: THINKING_LEVEL[opts.thinkingLevel] } : undefined,
        abortSignal: signal,
      },
    });
    return response.text ?? "";
  }, timeoutMs);
}

/** One request on the tier's model. A 429/503 retries once on the fallback model. */
async function generateText(
  primary: string,
  opts: { system: string; geminiSchema: object; thinkingLevel?: ThinkingLevelName },
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  try {
    return await callModel(primary, opts, prompt, timeoutMs);
  } catch (err) {
    if (err instanceof AiError || !isOverloaded(err)) throw toAiError(err, primary);
    logFailure(primary, err);
    const fallback = models().fallback;
    try {
      return await callModel(fallback, opts, prompt, timeoutMs);
    } catch (fallbackErr) {
      throw toAiError(fallbackErr, fallback);
    }
  }
}

/**
 * Structured JSON call. Parses and validates with zod. On a JSON or zod error it retries once,
 * with the error message appended to the prompt. Throws AiError on final failure.
 */
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const geminiSchema = opts.geminiSchema ?? toGeminiSchema(opts.schema);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS[opts.tier];
  const thinkingLevel = opts.thinkingLevel ?? (opts.tier === "fast" ? "low" : undefined);
  const primary = models()[opts.tier];
  const callOpts = { system: opts.system, geminiSchema, thinkingLevel };

  let prompt = opts.prompt;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await generateText(primary, callOpts, prompt, timeoutMs);

    let problem: string;
    try {
      const parsed = opts.schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    } catch (err) {
      problem = err instanceof Error ? `invalid JSON: ${err.message}` : "invalid JSON";
    }

    prompt = `${opts.prompt}\n\nYour previous reply was rejected: ${problem}. Reply again with valid JSON that matches the schema.`;
  }

  throw new AiError("The AI returned an unreadable response. Try again.", "invalid");
}

/** 768-dim embedding (gemini-embedding-001). Throws AiError if the size is wrong. */
export async function embed(text: string): Promise<number[]> {
  const model = models().embed;
  const response = await withTimeout(
    (signal) =>
      getClient().models.embedContent({
        model,
        contents: text,
        config: { outputDimensionality: EMBED_DIMS, abortSignal: signal },
      }),
    EMBED_TIMEOUT_MS,
  ).catch((err: unknown) => {
    throw toAiError(err, model);
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== EMBED_DIMS) {
    throw new AiError("The AI returned an unexpected embedding.", "invalid");
  }
  return values;
}
