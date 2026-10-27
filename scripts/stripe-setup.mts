/**
 * Makes (or re-checks) everything Crossword Clash Plus needs in a Stripe
 * account: the product with its statement descriptor, the monthly and annual
 * prices, and the webhook endpoint that feeds `verify-purchase`. Run it once
 * per mode — the test key makes test objects, the live key live ones — and
 * then `pnpm stripe:portal-config` for the Customer Portal configuration.
 * Definitions: src/lib/stripeSetup.ts. Runbook: docs/plus-setup.md §3.1.
 *
 *   pnpm stripe:setup [--dry-run] [--supabase-url https://….supabase.co]
 *
 * Reads STRIPE_SECRET_KEY (and VITE_SUPABASE_URL for the webhook URL) from
 * the environment or .env.local. The key never leaves this machine and is
 * never printed. Idempotent: the product is found by its metadata, the
 * prices by lookup key, the endpoint by URL; an existing price whose amount
 * or interval differs stops the run instead of being duplicated. The
 * webhook's signing secret is only shown by Stripe at creation, so it is
 * printed once, as the `.env.local` line and the `secrets set` command to
 * run next.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  PLUS_PRICES,
  describeAccount,
  findProduct,
  findWebhook,
  priceMismatch,
  priceParams,
  productParams,
  webhookParams,
  webhookUrl,
  type ExistingPrice,
} from "../src/lib/stripeSetup.ts";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "supabase-url": { type: "string" },
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
const supabaseUrl = values["supabase-url"] ?? env.VITE_SUPABASE_URL;
if (!key || !supabaseUrl) {
  console.error("Need STRIPE_SECRET_KEY and VITE_SUPABASE_URL in the environment or .env.local (or --supabase-url).");
  process.exit(1);
}
const mode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
const projectRef = /^https:\/\/([a-z0-9-]+)\.supabase\.co/.exec(supabaseUrl)?.[1] ?? "<project-ref>";

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

// Which account is this key for? A key for the wrong account is the easy mistake.
const account = await stripe<Parameters<typeof describeAccount>[0]>("GET", "account");
const who = describeAccount(account);
console.error(`Stripe ${mode.toUpperCase()} mode · account ${who.summary}`);
if (!who.looksLikeOurs) {
  console.error("That account's name and statement descriptor do not mention Crossword Clash. Set them under Settings → Business → Public details first, or check the key.");
  process.exit(1);
}

const url = webhookUrl(supabaseUrl);
if (values["dry-run"]) {
  console.log("# product"); for (const [k, v] of productParams()) console.log(`${k}=${v}`);
  for (const price of PLUS_PRICES) { console.log(`# price ${price.plan}`); for (const [k, v] of priceParams("prod_<new>", price)) console.log(`${k}=${v}`); }
  console.log("# webhook"); for (const [k, v] of webhookParams(url, mode)) console.log(`${k}=${v}`);
  process.exit(0);
}

// 1. Product.
const products = await stripe<{ data: { id: string; metadata?: Record<string, string>; active?: boolean }[] }>("GET", "products?limit=100");
const foundProduct = findProduct(products.data);
const product = foundProduct
  ? await stripe<{ id: string }>("POST", `products/${foundProduct}`, productParams())
  : await stripe<{ id: string }>("POST", "products", productParams());
console.error(`${foundProduct ? "Updated" : "Created"} product ${product.id}`);

// 2. Prices, by lookup key.
const priceIds: Record<string, string> = {};
for (const price of PLUS_PRICES) {
  const existing = await stripe<{ data: ExistingPrice[] }>("GET", `prices?lookup_keys[]=${encodeURIComponent(price.lookupKey)}&limit=1`);
  const found = existing.data[0];
  if (found) {
    const problem = priceMismatch(found, price, product.id);
    if (problem) {
      console.error(`Existing price ${problem}. Archive it in the dashboard (or move its lookup key) and rerun.`);
      process.exit(1);
    }
    priceIds[price.plan] = found.id;
    console.error(`Kept price ${found.id} (${price.plan})`);
  } else {
    const made = await stripe<{ id: string }>("POST", "prices", priceParams(product.id, price));
    priceIds[price.plan] = made.id;
    console.error(`Created price ${made.id} (${price.plan})`);
  }
}

// 3. Webhook endpoint.
const endpoints = await stripe<{ data: { id: string; url: string; status?: string }[] }>("GET", "webhook_endpoints?limit=100");
const foundWebhook = findWebhook(endpoints.data, url);
let webhookSecret: string | null = null;
if (foundWebhook) {
  // enabled_events and description can be updated; api_version and the secret cannot.
  await stripe("POST", `webhook_endpoints/${foundWebhook}`, webhookParams(url, mode).filter(([k]) => k !== "url" && k !== "api_version"));
  console.error(`Updated webhook ${foundWebhook} (its signing secret is unchanged; Stripe shows it only at creation)`);
} else {
  const made = await stripe<{ id: string; secret: string }>("POST", "webhook_endpoints", webhookParams(url, mode));
  webhookSecret = made.secret;
  console.error(`Created webhook ${made.id} → ${url}`);
}

// What to do with it.
console.error("\nPut these in .env.local (replacing the previous values), then run pnpm stripe:portal-config:");
console.log(`STRIPE_PRICE_MONTHLY=${priceIds.monthly}`);
console.log(`STRIPE_PRICE_ANNUAL=${priceIds.annual}`);
if (webhookSecret) console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
console.error("\nAnd on the Supabase project:");
console.log(
  `npx supabase secrets set STRIPE_PRICE_MONTHLY=${priceIds.monthly} STRIPE_PRICE_ANNUAL=${priceIds.annual}${webhookSecret ? ` STRIPE_WEBHOOK_SECRET=${webhookSecret}` : ""} STRIPE_SECRET_KEY=<the ${mode} key> --project-ref ${projectRef} </dev/null`,
);
