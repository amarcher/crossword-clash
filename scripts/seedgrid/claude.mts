/**
 * Minimal Claude client for the construction pipeline. Every call uses
 * structured output, so the reply is JSON matching the given schema.
 * Reads ANTHROPIC_API_KEY from the environment or .env.local.
 */
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MODEL = process.env.SEEDGRID_MODEL ?? "claude-opus-5-5";

function apiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envFile = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, "utf8").split("\n").find((l) => l.startsWith("ANTHROPIC_API_KEY="));
    const value = line?.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  throw new Error("ANTHROPIC_API_KEY is not set (environment or .env.local).");
}

export interface JsonCall {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
}

export interface Usage {
  input: number;
  output: number;
}

export const usage: Usage = { input: 0, output: 0 };

/** Structured output requires every object to forbid extra keys. */
function closed(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closed);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = closed(v);
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

export async function callJson<T>(call: JsonCall): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: call.model ?? DEFAULT_MODEL,
        max_tokens: call.maxTokens ?? 8000,
        system: call.system,
        output_config: { format: { type: "json_schema", schema: closed(call.schema) } },
        messages: [{ role: "user", content: call.prompt }],
      }),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const body = (await res.json()) as {
      content: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    usage.input += body.usage?.input_tokens ?? 0;
    usage.output += body.usage?.output_tokens ?? 0;
    if (body.stop_reason === "max_tokens") throw new Error("Claude ran out of output tokens; raise maxTokens.");
    const text = body.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Claude returned no text");
    return JSON.parse(text) as T;
  }
}
