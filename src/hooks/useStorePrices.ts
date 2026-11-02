import { useEffect, useState } from "react";
import { fetchNativePrices, nativePurchaseAvailable, type NativePlanPrice } from "../lib/nativePurchase";

/**
 * The store's own prices in the apps (localized, the ones the purchase sheet
 * will charge), so the pitch and the buttons never disagree. Empty on the web
 * and until the offering answers; callers fall back to the USD constants.
 */
export function useStorePrices(): NativePlanPrice[] {
  const native = nativePurchaseAvailable();
  const [prices, setPrices] = useState<NativePlanPrice[]>([]);
  useEffect(() => {
    if (!native) return;
    let live = true;
    void fetchNativePrices().then((p) => live && setPrices(p));
    return () => {
      live = false;
    };
  }, [native]);
  return prices;
}
