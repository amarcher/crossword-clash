/**
 * The Customer Portal configuration for Crossword Clash Plus, as the Stripe
 * API wants it (`POST /v1/billing_portal/configurations`, form-encoded).
 *
 * A portal configuration is account-wide: the account's default one has no
 * legal links and its "switch plans" list is whatever products the account
 * holds. Plus gets its own configuration (spec: docs/plus-setup.md §3.1),
 * which the `billing-portal` function names in each session through the
 * `STRIPE_PORTAL_CONFIG` secret. Pure so `pnpm stripe:portal-config` and its
 * test share one definition.
 */

/** Finds our configuration among the account's, however many it has. */
export const PORTAL_CONFIG_MARKER = { key: "app", value: "crossword-clash-plus" } as const;

export const PORTAL_CONFIG_NAME = "Crossword Clash Plus";

export interface PortalConfigInput {
  /** The Plus product id (`prod_…`), the parent of both prices. */
  product: string;
  /** The two recurring Plus prices (`price_…`); the only plans a subscriber may switch between. */
  prices: readonly string[];
  /** Site origin for the legal links and the return link, e.g. https://crosswordclash.com */
  siteUrl: string;
}

/**
 * The form fields for creating or updating the configuration. Stripe's
 * API takes nested params as bracketed keys; arrays repeat the key with `[]`.
 */
export function portalConfigParams(input: PortalConfigInput): [string, string][] {
  const site = input.siteUrl.replace(/\/+$/, "");
  if (!/^prod_/.test(input.product)) throw new Error(`not a product id: ${input.product}`);
  if (input.prices.length === 0 || input.prices.some((p) => !/^price_/.test(p))) {
    throw new Error(`prices must be price_… ids: ${input.prices.join(", ") || "(none)"}`);
  }
  const params: [string, string][] = [
    ["name", PORTAL_CONFIG_NAME],
    [`metadata[${PORTAL_CONFIG_MARKER.key}]`, PORTAL_CONFIG_MARKER.value],
    ["business_profile[headline]", "Manage your Crossword Clash Plus subscription"],
    ["business_profile[privacy_policy_url]", `${site}/privacy`],
    ["business_profile[terms_of_service_url]", `${site}/terms`],
    ["default_return_url", `${site}/menu`],
    // Email and address can be changed; the name stays what the card says.
    ["features[customer_update][enabled]", "true"],
    ["features[customer_update][allowed_updates][]", "email"],
    ["features[customer_update][allowed_updates][]", "address"],
    ["features[invoice_history][enabled]", "true"],
    ["features[payment_method_update][enabled]", "true"],
    // Cancel at the end of the paid period (docs/plus-setup.md §3.1), with a reason we can read.
    ["features[subscription_cancel][enabled]", "true"],
    ["features[subscription_cancel][mode]", "at_period_end"],
    ["features[subscription_cancel][proration_behavior]", "none"],
    ["features[subscription_cancel][cancellation_reason][enabled]", "true"],
    ...["too_expensive", "missing_features", "switched_service", "unused", "other"].map(
      (reason): [string, string] => ["features[subscription_cancel][cancellation_reason][options][]", reason],
    ),
    // Switch between monthly and yearly only; Stripe prorates the difference.
    ["features[subscription_update][enabled]", "true"],
    ["features[subscription_update][default_allowed_updates][]", "price"],
    ["features[subscription_update][proration_behavior]", "create_prorations"],
    ["features[subscription_update][products][0][product]", input.product],
    ...input.prices.map((price): [string, string] => ["features[subscription_update][products][0][prices][]", price]),
  ];
  return params;
}

/** Picks our configuration out of a `GET /v1/billing_portal/configurations` listing. */
export function findPortalConfig(
  configurations: readonly { id: string; metadata?: Record<string, string> | null; active?: boolean }[],
): string | null {
  const ours = configurations.filter((c) => c.metadata?.[PORTAL_CONFIG_MARKER.key] === PORTAL_CONFIG_MARKER.value);
  return (ours.find((c) => c.active !== false) ?? ours[0])?.id ?? null;
}
