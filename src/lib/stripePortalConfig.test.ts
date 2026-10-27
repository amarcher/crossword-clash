import { describe, expect, it } from "vitest";
import { findPortalConfig, PORTAL_CONFIG_MARKER, portalConfigParams } from "./stripePortalConfig";

const input = {
  product: "prod_123",
  prices: ["price_month", "price_year"],
  siteUrl: "https://crosswordclash.com/",
};

describe("portalConfigParams", () => {
  const params = portalConfigParams(input);
  const get = (key: string) => params.filter(([k]) => k === key).map(([, v]) => v);

  it("names and marks the configuration so a rerun can find it", () => {
    expect(get("name")).toEqual(["Crossword Clash Plus"]);
    expect(get(`metadata[${PORTAL_CONFIG_MARKER.key}]`)).toEqual([PORTAL_CONFIG_MARKER.value]);
  });

  it("points the legal links and the return link at the site, without a double slash", () => {
    expect(get("business_profile[privacy_policy_url]")).toEqual(["https://crosswordclash.com/privacy"]);
    expect(get("business_profile[terms_of_service_url]")).toEqual(["https://crosswordclash.com/terms"]);
    expect(get("default_return_url")).toEqual(["https://crosswordclash.com/menu"]);
  });

  it("cancels at period end with a reason, and lets a subscriber update card, email and address", () => {
    expect(get("features[subscription_cancel][enabled]")).toEqual(["true"]);
    expect(get("features[subscription_cancel][mode]")).toEqual(["at_period_end"]);
    expect(get("features[subscription_cancel][cancellation_reason][enabled]")).toEqual(["true"]);
    expect(get("features[subscription_cancel][cancellation_reason][options][]")).toContain("too_expensive");
    expect(get("features[payment_method_update][enabled]")).toEqual(["true"]);
    expect(get("features[invoice_history][enabled]")).toEqual(["true"]);
    expect(get("features[customer_update][allowed_updates][]")).toEqual(["email", "address"]);
  });

  it("allows switching only between the Plus prices", () => {
    expect(get("features[subscription_update][enabled]")).toEqual(["true"]);
    expect(get("features[subscription_update][default_allowed_updates][]")).toEqual(["price"]);
    expect(get("features[subscription_update][products][0][product]")).toEqual(["prod_123"]);
    expect(get("features[subscription_update][products][0][prices][]")).toEqual(["price_month", "price_year"]);
    expect(params.filter(([k]) => k.startsWith("features[subscription_update][products][1]"))).toEqual([]);
  });

  it("refuses ids of the wrong kind", () => {
    expect(() => portalConfigParams({ ...input, product: "price_x" })).toThrow(/product id/);
    expect(() => portalConfigParams({ ...input, prices: [] })).toThrow(/price_/);
    expect(() => portalConfigParams({ ...input, prices: ["prod_x"] })).toThrow(/price_/);
  });

  it("encodes as a form body Stripe accepts (repeated keys for arrays)", () => {
    const body = new URLSearchParams(params).toString();
    expect(body).toContain("features%5Bsubscription_update%5D%5Bproducts%5D%5B0%5D%5Bprices%5D%5B%5D=price_month");
    expect(body).toContain("features%5Bsubscription_update%5D%5Bproducts%5D%5B0%5D%5Bprices%5D%5B%5D=price_year");
  });
});

describe("findPortalConfig", () => {
  it("returns our active configuration, or an inactive one as a fallback, or null", () => {
    const ours = { id: "bpc_ours", metadata: { app: "crossword-clash-plus" }, active: true };
    const stale = { id: "bpc_stale", metadata: { app: "crossword-clash-plus" }, active: false };
    const theirs = { id: "bpc_default", metadata: {}, active: true };
    expect(findPortalConfig([theirs, stale, ours])).toBe("bpc_ours");
    expect(findPortalConfig([theirs, stale])).toBe("bpc_stale");
    expect(findPortalConfig([theirs, { id: "bpc_nometa", metadata: null }])).toBeNull();
    expect(findPortalConfig([])).toBeNull();
  });
});
