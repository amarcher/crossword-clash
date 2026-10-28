import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The RevenueCat, social-login, app-update and filesystem plugins are for the native apps only
 * (docs/monetization-spec.md §1.9 asks the same of AdMob): their imports sit
 * behind the static `import.meta.env.MODE === "mobile"` switch so Rollup
 * drops them from web builds. This reads the built web bundle (CI builds
 * before testing; skipped when there is no dist/) and fails if any of them
 * made it in.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const assets = here("../../dist/assets/");
const hasDist = existsSync(assets);
// A mobile build (`pnpm build --mode mobile`) legitimately contains them; it has no prerendered folders.
const isWebBuild = hasDist && existsSync(here("../../dist/menu/index.html"));

describe("the web bundle", () => {
  it.skipIf(!isWebBuild)("carries none of the RevenueCat, social-login, app-update and filesystem plugins", () => {
    const offenders = readdirSync(assets)
      .filter((f) => f.endsWith(".js"))
      .filter((f) => /purchases-capacitor|capacitor-social-login|capacitor-app-update|capacitor-filesystem|revenuecat\/purchases|SocialLogin\.initialize|AppUpdate\.getAppUpdateInfo|Filesystem\.writeFile/.test(readFileSync(assets + f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
