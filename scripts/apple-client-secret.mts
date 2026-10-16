/**
 * Makes the "Secret Key (for OAuth)" that Supabase's Apple provider needs: a
 * JWT signed with the Sign in with Apple key (.p8) from Apple Developer →
 * Keys. Apple caps it at six months, so studio sign-in with Apple stops
 * working when it expires; run this again and paste the new one into Supabase
 * (Authentication → Sign In / Providers → Apple). The key never leaves this
 * machine.
 *
 *   pnpm apple:client-secret --team <TEAM_ID> --key-id <KEY_ID> --client-id <SERVICES_ID> --p8 <AuthKey_XXXX.p8>
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    team: { type: "string" },
    "key-id": { type: "string" },
    "client-id": { type: "string" },
    p8: { type: "string" },
  },
});
const { team, p8 } = values;
const keyId = values["key-id"];
const clientId = values["client-id"];
if (!team || !keyId || !clientId || !p8) {
  console.error("Usage: pnpm apple:client-secret --team <TEAM_ID> --key-id <KEY_ID> --client-id <SERVICES_ID> --p8 <AuthKey_XXXX.p8>");
  process.exit(1);
}

// Apple's maximum is 15777000 s (six months); stay a day under it.
const LIFETIME = 15777000 - 86400;
const now = Math.floor(Date.now() / 1000);
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${b64({ alg: "ES256", kid: keyId })}.${b64({ iss: team, iat: now, exp: now + LIFETIME, aud: "https://appleid.apple.com", sub: clientId })}`;
const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: fs.readFileSync(p8, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");

console.log(`${unsigned}.${signature}`);
console.error(`Expires ${new Date((now + LIFETIME) * 1000).toISOString().slice(0, 10)}. Paste it into Supabase → Authentication → Sign In / Providers → Apple → Secret Key (for OAuth).`);
