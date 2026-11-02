import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Capacitor plugin object is a Proxy that answers EVERY property with a
 * native-method wrapper, `then` included. A promise resolved with such an
 * object is treated as a thenable: JavaScript calls its `then`, the native
 * "then" never answers, and the promise never settles. The 1.1.0 build 10
 * paywall froze on exactly this. These tests load the two plugin modules
 * through stubs with that property and prove every path still settles.
 */
function pluginLike(impl: Record<string, (...args: unknown[]) => unknown>, calls: string[]) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "$$typeof") return undefined;
      if (prop === "toJSON") return () => ({});
      return (...args: unknown[]) => {
        calls.push(String(prop));
        const fn = impl[String(prop)];
        return fn ? fn(...args) : new Promise(() => {}); // an unknown method, `then` included, never answers
      };
    },
  });
}

const calls: string[] = [];
const purchasesImpl: Record<string, (...args: unknown[]) => unknown> = {};
const socialImpl: Record<string, (...args: unknown[]) => unknown> = {};

const platform = vi.hoisted(() => ({ value: "ios" }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => platform.value, isNativePlatform: () => true } }));
vi.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: pluginLike(purchasesImpl, calls) }));
vi.mock("@capgo/capacitor-social-login", () => ({ SocialLogin: pluginLike(socialImpl, calls) }));

const settles = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("never settled")), 1000))]);

beforeEach(() => {
  vi.stubEnv("MODE", "mobile");
  vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "appl_test");
  calls.length = 0;
  Object.keys(purchasesImpl).forEach((k) => delete purchasesImpl[k]);
  Object.keys(socialImpl).forEach((k) => delete socialImpl[k]);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RevenueCat plugin loading", () => {
  it("configures the SDK for the session user and buys a plan without ever awaiting the plugin proxy", async () => {
    const mod = await import("./nativePurchase");
    mod.resetNativePurchasesForTests();
    purchasesImpl.configure = () => "-1"; // a fire-and-forget native method returns a callback id, not a promise
    purchasesImpl.getOfferings = async () => ({ current: { availablePackages: [{ identifier: "$rc_annual", product: { priceString: "$24.99" } }] } });
    purchasesImpl.purchasePackage = async () => ({ customerInfo: {} });

    await settles(mod.syncNativePurchaseUser("user-1"));
    expect(calls).toContain("configure");
    expect(calls).not.toContain("then");

    await expect(settles(mod.purchaseNativePlan("annual"))).resolves.toBe("purchased");
    await expect(settles(mod.fetchNativePrices())).resolves.toEqual([{ plan: "annual", priceString: "$24.99" }]);
    expect(calls).not.toContain("then");
  });

  it("reports a plan the store does not offer and a cancelled purchase", async () => {
    const mod = await import("./nativePurchase");
    mod.resetNativePurchasesForTests();
    purchasesImpl.getOfferings = async () => ({ current: { availablePackages: [{ identifier: "$rc_monthly", product: { priceString: "$3.99" } }] } });
    purchasesImpl.purchasePackage = async () => { throw { userCancelled: true }; };
    purchasesImpl.configure = () => "-1";
    await settles(mod.syncNativePurchaseUser("user-1"));
    await expect(settles(mod.purchaseNativePlan("annual"))).rejects.toThrow(/isn't available/);
    await expect(settles(mod.purchaseNativePlan("monthly"))).resolves.toBe("cancelled");
  });
});

describe("RevenueCat user switching", () => {
  it("refuses to buy before the SDK has a user", async () => {
    const mod = await import("./nativePurchase");
    mod.resetNativePurchasesForTests();
    await expect(settles(mod.purchaseNativePlan("annual"))).rejects.toThrow(/isn't ready/);
    expect(calls).not.toContain("purchasePackage");
  });

  it("waits for a sign-in's logIn before buying, so the purchase lands on the signed-in account", async () => {
    const mod = await import("./nativePurchase");
    mod.resetNativePurchasesForTests();
    const order: string[] = [];
    let finishLogIn: () => void = () => {};
    purchasesImpl.configure = () => "-1";
    purchasesImpl.logIn = () => new Promise<void>((resolve) => { finishLogIn = () => { order.push("logIn"); resolve(); }; });
    purchasesImpl.getOfferings = async () => ({ current: { availablePackages: [{ identifier: "$rc_annual", product: { priceString: "$24.99", price: 24.99 } }] } });
    purchasesImpl.purchasePackage = async () => { order.push("purchase"); return { customerInfo: {} }; };
    await settles(mod.syncNativePurchaseUser("anon-1"));
    void mod.syncNativePurchaseUser("account-1");
    const bought = mod.purchaseNativePlan("annual");
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]);
    finishLogIn();
    await expect(settles(bought)).resolves.toBe("purchased");
    expect(order).toEqual(["logIn", "purchase"]);
  });
});

describe("native sign-in plugin loading", () => {
  it("initializes once and returns the provider's id token without awaiting the plugin proxy", async () => {
    const mod = await import("./nativeSignIn");
    mod.resetNativeSignInForTests();
    socialImpl.initialize = async () => undefined;
    let requested: { options?: { nonce?: string } } | undefined;
    socialImpl.login = async (args: unknown) => {
      requested = args as { options?: { nonce?: string } };
      return { result: { idToken: "tok-1" } };
    };
    const first = await settles(mod.nativeIdToken("apple"));
    expect(first.token).toBe("tok-1");
    expect(first.nonce).toMatch(/^[0-9a-f]{32}$/);
    // The OS request carries the SHA-256 of the nonce Supabase will be given (it hashes the raw one to compare).
    expect(requested?.options?.nonce).toBe(await mod.hashNonce(first.nonce));
    expect(requested?.options?.nonce).not.toBe(first.nonce);
    await settles(mod.nativeIdToken("google"));
    expect(calls.filter((c) => c === "initialize")).toHaveLength(1);
    expect(calls).not.toContain("then");
  });

  it("passes the Apple section to the plugin on iOS only (Android refuses it without a redirectUrl)", async () => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "web-client");
    const seen: Record<string, unknown>[] = [];
    socialImpl.initialize = async (args: unknown) => {
      seen.push(args as Record<string, unknown>);
    };
    const logins: { provider: string; options: Record<string, unknown> }[] = [];
    socialImpl.login = async (args: unknown) => {
      logins.push(args as { provider: string; options: Record<string, unknown> });
      return { result: { idToken: "tok" } };
    };
    const mod = await import("./nativeSignIn");
    for (const value of ["ios", "android"]) {
      platform.value = value;
      mod.resetNativeSignInForTests();
      await settles(mod.nativeIdToken("google"));
    }
    platform.value = "ios";
    expect(seen).toHaveLength(2);
    // Android Google login carries no scopes (the plugin would demand a modified MainActivity); iOS keeps them.
    expect(logins[0]).toMatchObject({ provider: "google", options: { scopes: ["email", "profile"] } });
    expect(logins[1]).toMatchObject({ provider: "google" });
    expect(logins[1].options).not.toHaveProperty("scopes");
    expect(seen[0]).toMatchObject({ apple: { clientId: "com.crosswordclash.app" }, google: { webClientId: "web-client" } });
    expect(seen[1]).not.toHaveProperty("apple");
    expect(seen[1]).toMatchObject({ google: { webClientId: "web-client" } });
  });
});
