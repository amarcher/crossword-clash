/**
 * Gives both Plus subscriptions a free first month in App Store Connect: a
 * FREE_TRIAL introductory offer of ONE_MONTH on `plus_monthly` and
 * `plus_annual`, in every territory the subscription is sold in, with no end
 * date (docs/plus-setup.md §3.8). Apple gives an introductory offer once per
 * subscription group per Apple ID, so this is "the first month is free" for a
 * new subscriber and nothing for a returning one.
 *
 * It only reads unless `--apply` is given, and it skips a territory that
 * already has an introductory offer, so it is safe to run again after a
 * partial failure.
 *
 *   pnpm appstore:intro-offers            # list what it would create
 *   pnpm appstore:intro-offers --apply    # create the offers
 *
 * Auth is the App Store Connect API key scripts/testflight.sh uses:
 * ASC_API_KEY_ID and ASC_API_ISSUER_ID (environment or .env.local) and
 * ~/.appstoreconnect/private_keys/AuthKey_<ASC_API_KEY_ID>.p8. The key never
 * leaves this machine.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const BUNDLE_ID = "com.crosswordclash.app";
const PRODUCT_IDS = ["plus_monthly", "plus_annual"];
const API = "https://api.appstoreconnect.apple.com";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
const apply = values.apply === true;

function envLocal(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = fs
      .readFileSync(path.resolve(".env.local"), "utf8")
      .split("\n")
      .find((l) => l.replace(/^export\s+/, "").startsWith(`${name}=`));
    return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

// A ready-made token (ASC_API_TOKEN) skips the key: for a run on a machine that does not hold the
// .p8, with a short-lived token minted where it does. Any non-empty value works when a proxy
// replaces the Authorization header.
const presetToken = envLocal("ASC_API_TOKEN");
const keyId = envLocal("ASC_API_KEY_ID");
const issuer = envLocal("ASC_API_ISSUER_ID");
const keyPath = path.join(os.homedir(), ".appstoreconnect", "private_keys", `AuthKey_${keyId}.p8`);
if (!presetToken) {
  if (!keyId || !issuer) {
    console.error("Set ASC_API_KEY_ID and ASC_API_ISSUER_ID (environment or .env.local), as for scripts/testflight.sh.");
    process.exit(1);
  }
  if (!fs.existsSync(keyPath)) {
    console.error(`${keyPath} is missing.`);
    process.exit(1);
  }
}

/** App Store Connect tokens live at most 20 minutes; a run takes well under that. */
function token(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({ iss: issuer, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" })}`;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: fs.readFileSync(keyPath, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${signature}`;
}
const bearer = presetToken ?? token();

interface Resource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

async function call(method: string, url: string, body?: unknown): Promise<{ data?: Resource | Resource[]; links?: { next?: string } }> {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

/** Every page of a list endpoint. */
async function all(url: string): Promise<Resource[]> {
  const out: Resource[] = [];
  let next: string | undefined = url;
  while (next) {
    const page = await call("GET", next);
    out.push(...((page.data as Resource[]) ?? []));
    next = page.links?.next;
  }
  return out;
}

const apps = await all(`/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
const app = apps[0];
if (!app) throw new Error(`No app with bundle id ${BUNDLE_ID} is visible to this API key.`);

const groups = await all(`/v1/apps/${app.id}/subscriptionGroups?limit=50`);
const subscriptions: Resource[] = [];
for (const group of groups) subscriptions.push(...(await all(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`)));

let created = 0;
let failed = 0;
for (const productId of PRODUCT_IDS) {
  const sub = subscriptions.find((s) => s.attributes?.productId === productId);
  if (!sub) throw new Error(`Subscription ${productId} was not found in the app's subscription groups.`);

  // Where the subscription is sold, and where an introductory offer already stands.
  const availability = await call("GET", `/v1/subscriptions/${sub.id}/subscriptionAvailability`);
  const availabilityId = (availability.data as Resource | undefined)?.id;
  if (!availabilityId) throw new Error(`${productId} has no availability set; set its territories first.`);
  const territories = (await all(`/v1/subscriptionAvailabilities/${availabilityId}/availableTerritories?limit=200`)).map((t) => t.id);

  const existing = await all(`/v1/subscriptions/${sub.id}/introductoryOffers?include=territory&limit=200`);
  const covered = new Map<string, string>();
  for (const offer of existing) {
    const territory = offer.relationships?.territory?.data?.id;
    if (territory) covered.set(territory, `${String(offer.attributes?.offerMode)} ${String(offer.attributes?.duration)}`);
  }
  const other = [...new Set([...covered.values()].filter((v) => v !== "FREE_TRIAL ONE_MONTH"))];
  const missing = territories.filter((t) => !covered.has(t));

  console.log(`${productId} (${sub.id}): sold in ${territories.length} territories, ${covered.size} already have an introductory offer, ${missing.length} to create.`);
  if (other.length > 0) console.log(`  Note: existing offers that are not a free month were left alone: ${other.join(", ")}.`);
  if (!apply) continue;

  for (const territory of missing) {
    try {
      await call("POST", "/v1/subscriptionIntroductoryOffers", {
        data: {
          type: "subscriptionIntroductoryOffers",
          attributes: { duration: "ONE_MONTH", offerMode: "FREE_TRIAL", numberOfPeriods: 1 },
          relationships: {
            subscription: { data: { type: "subscriptions", id: sub.id } },
            territory: { data: { type: "territories", id: territory } },
          },
        },
      });
      created += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ${productId} ${territory}: ${err instanceof Error ? err.message : String(err)}`);
      // The same refusal for every territory is one problem, not 175: stop after the first few.
      if (failed >= 3 && created === 0) throw new Error("Stopping: the first requests were all refused. Nothing was created.", { cause: err });
    }
  }
}

if (!apply) console.log("\nNothing was changed. Run again with --apply to create the offers.");
else console.log(`\nCreated ${created} introductory offers${failed ? `, ${failed} failed (run again to retry them)` : ""}.`);
if (failed) process.exit(1);
