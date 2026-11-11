import { useSyncExternalStore } from "react";
import { getEntitlementState, subscribeEntitlements } from "../lib/entitlements";
import { nativePurchaseAvailable } from "../lib/nativePurchase";
import type { PlusPlan } from "../lib/plusPurchase";
import { checkoutTrialDays } from "../lib/purchaseEvents";
import { useStorePrices } from "./useStorePrices";

const serverSnapshot = () => null;

/**
 * Whether each plan starts with a free first month for this visitor, so the
 * pitch and the buttons say what the purchase will do.
 *
 * Web: the rule create-checkout applies (`checkoutTrialDays`): free for
 * anyone with no entitlement row, which includes a visitor who has not signed
 * in yet. The server decides; Stripe's own page states the terms either way.
 *
 * Apps: only what the store reports for this store account, per plan (its
 * introductory offer, `NativePlanPrice.freeMonth`), so the app never promises
 * a trial the purchase sheet will not give. False until the offering answers.
 */
export function useFreeMonth(): Record<PlusPlan, boolean> {
  const native = nativePurchaseAvailable();
  const store = useStorePrices();
  const state = useSyncExternalStore(subscribeEntitlements, getEntitlementState, serverSnapshot);
  if (native) {
    const has = (plan: PlusPlan) => store.find((p) => p.plan === plan)?.freeMonth === true;
    return { annual: has("annual"), monthly: has("monthly") };
  }
  const free = checkoutTrialDays(state?.rows.length ?? 0) > 0;
  return { annual: free, monthly: free };
}
