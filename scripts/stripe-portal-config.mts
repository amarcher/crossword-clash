/**
 * Creates (or updates) the Customer Portal configuration for Crossword Clash
 * Plus in the Stripe account and prints the command that tells the
 * `billing-portal` function to use it. Why a separate configuration: the
 * Stripe account is shared with other products, and the account's default
 * portal carries their legal links and one plan-switch list for everything.
 * See docs/plus-setup.md §3.1 and src/lib/stripePortalConfig.ts.
 *
 *   pnpm stripe:portal-config [--dry-run] [--site https://crosswordclash.com]
 *
 * Reads STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL from
 * the environment or .env.local (test or live keys: the configuration is
 * made in whichever mode the key is). The key never leaves this machine and
 * is never printed. Idempotent: a configuration tagged with our metadata is
 * updated rather than duplicated.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { findPortalConfig, portalConfigParams } from "../src/lib/stripePortalConfig.ts";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    site: { type: "string", default: "https://crosswordclash.com" },
  },
});

function envFromFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...envFromFile(path.resolve(".env.local")), ...process.env };
const key = env.STRIPE_SECRET_KEY;
const prices = [env.STRIPE_PRICE_MONTHLY, env.STRIPE_PRICE_ANNUAL].filter((p): p is string => Boolean(p));
if (!key || prices.length !== 2) {
  console.error("Need STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL in the environment or .env.local.");
  process.exit(1);
}
const mode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "LIVE" : "test";

async function stripe<T>(method: "GET" | "POST", endpoint: string, body?: [string, string][]): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${data.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// Both prices must belong to one product; that product is the switch list.
const priceObjects = await Promise.all(prices.map((id) => stripe<{ id: string; product: string; recurring?: { interval?: string } }>("GET", `prices/${id}`)));
const products = new Set(priceObjects.map((p) => p.product));
if (products.size !== 1) {
  console.error(`The two prices belong to different products (${[...products].join(", ")}); they must share one.`);
  process.exit(1);
}
const [product] = products;
const params = portalConfigParams({ product, prices, siteUrl: values.site });

console.error(`Stripe ${mode} mode · product ${product} · prices ${priceObjects.map((p) => `${p.id} (${p.recurring?.interval ?? "?"})`).join(", ")}`);
if (values["dry-run"]) {
  for (const [k, v] of params) console.log(`${k}=${v}`);
  process.exit(0);
}

const existing = await stripe<{ data: { id: string; metadata?: Record<string, string>; active?: boolean }[] }>("GET", "billing_portal/configurations?limit=100");
const found = findPortalConfig(existing.data);
const config = found
  ? await stripe<{ id: string }>("POST", `billing_portal/configurations/${found}`, params)
  : await stripe<{ id: string }>("POST", "billing_portal/configurations", params);

console.error(`${found ? "Updated" : "Created"} portal configuration ${config.id}. Now tell the function about it:`);
console.log(`npx supabase secrets set STRIPE_PORTAL_CONFIG=${config.id} --project-ref rdqdhawlxuclfxpsvdgs </dev/null`);
