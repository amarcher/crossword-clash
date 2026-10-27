import { describe, expect, it } from "vitest";
import en from "../i18n/en.json";
import { STRIPE_API_VERSION } from "./purchaseEvents";
import {
  PLUS_PRICES,
  PLUS_PRODUCT,
  PLUS_WEBHOOK_EVENTS,
  describeAccount,
  findProduct,
  findWebhook,
  priceMismatch,
  priceParams,
  productParams,
  webhookParams,
  webhookUrl,
} from "./stripeSetup";

describe("stripeSetup", () => {
  it("describes the product with the paywall's own subtitle and a statement descriptor Stripe accepts", () => {
    expect(PLUS_PRODUCT.description).toBe((en as { plus: { subtitle: string } }).plus.subtitle);
    expect(PLUS_PRODUCT.statementDescriptor.length).toBeLessThanOrEqual(22);
    expect(PLUS_PRODUCT.statementDescriptor).toMatch(/^[A-Z0-9 ]+$/);
    const params = Object.fromEntries(productParams());
    expect(params).toMatchObject({
      name: "Crossword Clash Plus",
      statement_descriptor: "CROSSWORD CLASH PLUS",
      "metadata[app]": "crossword-clash-plus",
    });
  });

  it("prices the two plans the paywall advertises, each findable by lookup key", () => {
    expect(PLUS_PRICES.map((p) => [p.plan, p.unitAmount, p.interval])).toEqual([
      ["monthly", 399, "month"],
      ["annual", 2499, "year"],
    ]);
    const params = Object.fromEntries(priceParams("prod_1", PLUS_PRICES[1]));
    expect(params).toMatchObject({
      product: "prod_1",
      currency: "usd",
      unit_amount: "2499",
      "recurring[interval]": "year",
      lookup_key: "crossword-clash-plus-annual",
      transfer_lookup_key: "true",
      "metadata[app]": "crossword-clash-plus",
      "metadata[plan]": "annual",
    });
    expect(() => priceParams("price_1", PLUS_PRICES[0])).toThrow(/product id/);
  });

  it("points the webhook at the project's verify-purchase route with the four subscription events", () => {
    const url = webhookUrl("https://rdqdhawlxuclfxpsvdgs.supabase.co/");
    expect(url).toBe("https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/verify-purchase/stripe");
    expect(() => webhookUrl("https://example.com")).toThrow(/Supabase/);
    const params = webhookParams(url, "live");
    const events = params.filter(([k]) => k === "enabled_events[]").map(([, v]) => v);
    expect(events).toEqual([...PLUS_WEBHOOK_EVENTS]);
    expect(events).not.toContain("invoice.paid");
    expect(Object.fromEntries(params)).toMatchObject({ url, api_version: STRIPE_API_VERSION });
    expect(Object.fromEntries(params).description).toContain("live mode");
  });

  it("finds our product by its marker, preferring an active one", () => {
    expect(findProduct([{ id: "prod_other", metadata: { fablePurchase: "x" } }])).toBeNull();
    expect(
      findProduct([
        { id: "prod_old", metadata: { app: "crossword-clash-plus" }, active: false },
        { id: "prod_new", metadata: { app: "crossword-clash-plus" }, active: true },
      ]),
    ).toBe("prod_new");
    expect(findProduct([{ id: "prod_old", metadata: { app: "crossword-clash-plus" }, active: false }])).toBe("prod_old");
  });

  it("refuses a price whose immutable facts differ from the plan", () => {
    const want = PLUS_PRICES[0];
    const good = { id: "price_1", product: "prod_1", unit_amount: 399, currency: "usd", recurring: { interval: "month" }, active: true };
    expect(priceMismatch(good, want, "prod_1")).toBeNull();
    expect(priceMismatch({ ...good, unit_amount: 499 }, want, "prod_1")).toMatch(/499 cents, not 399/);
    expect(priceMismatch({ ...good, recurring: { interval: "year" } }, want, "prod_1")).toMatch(/every year, not month/);
    expect(priceMismatch({ ...good, product: "prod_2" }, want, "prod_1")).toMatch(/belongs to prod_2/);
    expect(priceMismatch({ ...good, active: false }, want, "prod_1")).toMatch(/archived/);
  });

  it("finds the endpoint by URL and sizes up an account by name and descriptor", () => {
    const url = "https://x.supabase.co/functions/v1/verify-purchase/stripe";
    expect(findWebhook([{ id: "we_1", url: "https://fabledesigner.com/api/stripe/webhook" }, { id: "we_2", url }], url)).toBe("we_2");
    expect(findWebhook([], url)).toBeNull();
    expect(describeAccount({ settings: { dashboard: { display_name: "Fable Designer" }, payments: { statement_descriptor: "FABLE DESIGNER" } } })).toEqual({
      summary: "Fable Designer · statement descriptor FABLE DESIGNER",
      looksLikeOurs: false,
    });
    expect(describeAccount({ settings: { dashboard: { display_name: "Crossword Clash" }, payments: { statement_descriptor: null } } }).looksLikeOurs).toBe(true);
  });
});
