import { neon } from "npm:@neondatabase/serverless";

export function logUsage(
  service: string,
  endpoint: string,
  data: {
    tokensIn?: number;
    tokensOut?: number;
    characters?: number;
    model?: string;
  },
) {
  const dbUrl = Deno.env.get("DASHBOARD_DATABASE_URL");
  if (!dbUrl) return;
  const sql = neon(dbUrl);
  sql`INSERT INTO api_usage (project, service, endpoint, tokens_in, tokens_out, characters, model)
    VALUES ('crossword-clash', ${service}, ${endpoint}, ${data.tokensIn ?? 0}, ${data.tokensOut ?? 0}, ${data.characters ?? 0}, ${data.model ?? null})`.catch(
    (e: unknown) =>
      console.error(`[${endpoint}] usage log failed:`, e),
  );
}
