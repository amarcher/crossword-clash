import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import { track } from "../../lib/analytics";
import type { EntitlementRow } from "../../lib/entitlements";
import { formatUsd, PLUS_ANNUAL_USD, PLUS_MONTHLY_USD } from "../../lib/plus";
import { openBillingPortal, reconcileEntitlements, startCheckout, storeManagementUrl, type PlusPlan } from "../../lib/plusPurchase";
import { nativePurchaseAvailable, purchaseNativePlan, purchasePlatform, restoreNativePurchases } from "../../lib/nativePurchase";
import { SITE_ORIGIN } from "../../lib/pageMeta";
import { useStorePrices } from "../../hooks/useStorePrices";

export interface PurchaseAccount {
  /** Signed in to a real account (null while anonymous). */
  signedIn: boolean;
  plus: boolean;
  plusRow: EntitlementRow | null;
  refreshEntitlements: () => Promise<void>;
}

interface PlusPurchaseControlsProps {
  account: PurchaseAccount;
  /** For the funnel (`checkout_started { placement }`). */
  placement: string;
  /** Where the web Checkout should come back to (default: this page). */
  returnTo?: string;
  /** Native only: shown under a subscriber who is still anonymous (a purchase from before sign-in-first) so Plus can follow them to other devices. */
  signInPrompt?: React.ReactNode;
}

const LINK = "min-h-11 inline-flex items-center rounded-lg px-1 underline-offset-2 hover:underline active:underline focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * The buy / manage / restore controls under the Plus pitch
 * (docs/monetization-spec.md §3.3): Stripe Checkout on the web, RevenueCat in
 * the apps, both ending in the same `entitlements` rows. Shows the two plans
 * (annual first), "Restore purchases" in the apps, "Manage subscription"
 * (Customer Portal or the store's own settings), and the Terms / Privacy
 * links Apple's Schedule 2 requires on every paywall. The apps never link to
 * the web checkout.
 */
export function PlusPurchaseControls({ account, placement, returnTo, signInPrompt }: PlusPurchaseControlsProps) {
  const { t, i18n } = useTranslation();
  const native = nativePurchaseAvailable();
  const channel = native ? "revenuecat" : "stripe";
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const prices = useStorePrices();

  const priceFor = (plan: PlusPlan) =>
    prices.find((p) => p.plan === plan)?.priceString ?? formatUsd(plan === "annual" ? PLUS_ANNUAL_USD : PLUS_MONTHLY_USD, i18n.language);

  const act = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error && err.message ? err.message : t("plus.purchaseFailed") });
    } finally {
      setBusy(null);
    }
  };

  const buy = (plan: PlusPlan) =>
    void act(plan, async () => {
      track("checkout_started", { channel, plan, placement });
      if (native) {
        const outcome = await purchaseNativePlan(plan);
        if (outcome === "cancelled") return;
        const rows = await reconcileEntitlements("revenuecat").catch(() => [] as EntitlementRow[]);
        await account.refreshEntitlements();
        track("purchase_completed", { channel, plan });
        // The store took the money; if our row isn't there yet (webhook in flight, RevenueCat
        // still validating), don't say "You're Plus" over the buy buttons.
        const found = rows.some((r) => (r.status === "active" || r.status === "grace") && (r.product === "plus" || r.product === "supporter"));
        setNotice({ kind: "ok", text: t(found ? "plus.purchased" : "plus.purchasePending") });
      } else {
        await startCheckout(plan, returnTo);
        // The browser is leaving for Stripe; stay busy meanwhile.
        setBusy(plan);
      }
    });

  const restore = () =>
    void act("restore", async () => {
      await restoreNativePurchases();
      const rows = await reconcileEntitlements("revenuecat");
      await account.refreshEntitlements();
      const found = rows.some((r) => (r.status === "active" || r.status === "grace") && (r.product === "plus" || r.product === "supporter"));
      if (found) track("purchase_restored");
      setNotice({ kind: found ? "ok" : "error", text: t(found ? "plus.restored" : "plus.nothingToRestore") });
    });

  const manage = () =>
    void act("manage", async () => {
      if (account.plusRow?.source === "stripe") {
        await openBillingPortal(returnTo);
        setBusy("manage");
        return;
      }
      const url = storeManagementUrl(account.plusRow, purchasePlatform());
      if (url) window.open(url, "_blank", "noopener");
    });

  // In the apps a relative link opens nothing on iOS (WebKit hands capacitor://localhost/terms
  // to UIApplication.open) and replaces the app on Android; the public site opens in the browser.
  const legalHref = (path: string) => (native ? `${SITE_ORIGIN}${path}` : path);
  const legal = (
    <p className="text-center text-xs leading-relaxed text-subtle">
      {t("plus.legalNote")}{" "}
      <a className={LINK} href={legalHref("/terms")} target="_blank" rel="noopener">
        {t("plus.terms")}
      </a>{" "}
      ·{" "}
      <a className={LINK} href={legalHref("/privacy")} target="_blank" rel="noopener">
        {t("plus.privacy")}
      </a>
    </p>
  );

  if (account.plus) {
    const row = account.plusRow;
    const when = row?.expires_at ? new Date(row.expires_at).toLocaleDateString(i18n.language, { month: "long", day: "numeric", year: "numeric" }) : null;
    const status = !row || !when ? t("plus.lifetime") : row.will_renew ? t("plus.renewsOn", { date: when }) : t("plus.endsOn", { date: when });
    const manageable = row?.source === "stripe" || !!storeManagementUrl(row, purchasePlatform());
    return (
      <div className="flex flex-col gap-2.5">
        {/* A purchase or restore has just succeeded: say so first, where the eye lands, not under the sign-in prompt. */}
        {notice && <Notice notice={notice} prominent />}
        <p className="text-center text-sm text-ink-soft">{status}</p>
        {manageable && (
          <Button variant="secondary" size="lg" block disabled={busy !== null} aria-busy={busy === "manage" || undefined} onClick={manage}>
            {row?.source === "stripe" ? t("plus.manage") : t("plus.manageInStore")}
          </Button>
        )}
        {/* No "Restore purchases" here: Apple's 3.1.1 wants restore reachable, and the
            non-subscriber view below has it; a subscriber has nothing to restore. */}
        {native && !account.signedIn && signInPrompt}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Button size="lg" block disabled={busy !== null} aria-busy={busy === "annual" || undefined} onClick={() => buy("annual")}>
        {t("plus.subscribeAnnual", { price: priceFor("annual") })}
      </Button>
      <Button variant="secondary" size="lg" block disabled={busy !== null} aria-busy={busy === "monthly" || undefined} onClick={() => buy("monthly")}>
        {t("plus.subscribeMonthly", { price: priceFor("monthly") })}
      </Button>
      {native && (
        <Button variant="ghost" size="md" block disabled={busy !== null} aria-busy={busy === "restore" || undefined} onClick={restore}>
          {t("plus.restore")}
        </Button>
      )}
      {notice && <Notice notice={notice} />}
      {legal}
    </div>
  );
}

function Notice({ notice, prominent = false }: { notice: { kind: "ok" | "error"; text: string }; prominent?: boolean }) {
  const ok = notice.kind !== "error";
  if (prominent && ok) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
        {notice.text}
      </p>
    );
  }
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${ok ? "bg-brand-50 text-brand-700" : "bg-gold-50 text-ink-soft"}`}>
      {notice.text}
    </p>
  );
}
