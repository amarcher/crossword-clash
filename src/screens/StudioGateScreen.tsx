import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Grid3x3, PencilRuler, Share2, Sparkles, WandSparkles } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { ProviderButton } from "../components/Account/ProviderButton";
import { PlusPitch } from "../components/Plus/PlusPitch";
import { PlusPurchaseControls } from "../components/Plus/PlusPurchaseControls";
import { useStudioAccount } from "../hooks/useStudioAccount";
import { track } from "../lib/analytics";
import { availableProviders, fetchEnabledProviders, type AuthProvider } from "../lib/account";
import { resumeStudioSignIn, signInToStudio } from "../lib/studioAuth";
import { studioGateBypassed, studioVerdict } from "../lib/studioGate";
import { screenModules } from "../routeModules";

// The editor, its worker and the wasm engine load only once the gate passes, so
// a free visitor pays nothing in bytes for a studio they cannot open.
const StudioScreen = lazy(() => screenModules.studio().then((m) => ({ default: m.StudioScreen })));

/**
 * /studio (docs/monetization-spec.md §2.2): the construction studio is a Plus
 * feature. Admins and Plus subscribers get the editor; an anonymous visitor
 * is asked to sign in first (Plus needs an account); a free account sees what
 * Plus is. Dev and VITE_STUDIO builds skip the gate, as before Plus.
 */
export function StudioGateScreen() {
  const { t } = useTranslation();
  const account = useStudioAccount();
  const verdict = studioVerdict({
    bypass: studioGateBypassed(),
    ready: account.ready,
    plusReady: account.plusReady,
    signedIn: !!account.user,
    admin: account.admin,
    plus: account.plus,
  });

  useEffect(() => {
    if (verdict === "plus" || verdict === "sign-in") track("paywall_viewed", { placement: "studio", feature: "studio", state: verdict });
  }, [verdict]);

  if (verdict === "editor") {
    return (
      <Suspense fallback={<GateShell>{<p className="text-sm text-muted">{t("studio.loading")}</p>}</GateShell>}>
        <StudioScreen />
      </Suspense>
    );
  }

  return (
    <GateShell>
      {verdict === "loading" ? (
        <p className="text-sm text-muted" aria-busy="true">
          {t("studio.loading")}
        </p>
      ) : (
        // One card on a phone; from lg up the pitch sits beside what the studio
        // does, so a wide screen is not a 28rem card in a sea of canvas (Andrew,
        // 2026-11-03). The Plus card is the fixed-width column and stays in view.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-10">
          <section aria-labelledby="studio-gate-title" className="lg:pt-2">
            <div className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 lg:size-12">
                <PencilRuler className="size-5 lg:size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 id="studio-gate-title" className="font-display text-xl font-bold leading-snug tracking-tight text-ink lg:text-3xl">
                  {t("studio.gateTitle")}
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-muted lg:text-base">{t("studio.gateBody")}</p>
              </div>
            </div>
            <ul className="mt-6 hidden gap-4 lg:grid lg:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug text-ink">{t(title)}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">{t(body)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label={t("plus.title")} className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-6">
            <PlusPitch>
              {verdict === "sign-in" ? (
                <SignInButtons />
              ) : (
                <PlusPurchaseControls
                  account={{ signedIn: !!account.user, plus: account.plus, plusRow: account.plusRow, refreshEntitlements: account.refreshEntitlements }}
                  placement="studio"
                  returnTo="/studio"
                />
              )}
            </PlusPitch>
          </section>
        </div>
      )}
    </GateShell>
  );
}

/** What the studio does, told beside the pitch where there is room for it (lg up). */
const FEATURES = [
  { icon: Grid3x3, title: "studio.gateFeatureLayoutTitle", body: "studio.gateFeatureLayoutBody" },
  { icon: WandSparkles, title: "studio.gateFeatureCluesTitle", body: "studio.gateFeatureCluesBody" },
  { icon: Share2, title: "studio.gateFeaturePublishTitle", body: "studio.gateFeaturePublishBody" },
  { icon: Sparkles, title: "studio.gateFeatureAnywhereTitle", body: "studio.gateFeatureAnywhereBody" },
] as const;

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="md" widthLg="5xl" background="canvas" bar={{ backLabel: "Menu", backTo: "/menu" }}>
      <main className="mt-6 pb-8">{children}</main>
    </PageShell>
  );
}

/** Apple / Google — the site's providers, or the OS sheets the app can show (`availableProviders`); on the web the return trip lands back on /studio. */
function SignInButtons() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<Record<AuthProvider, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchEnabledProviders().then(setEnabled);
    void resumeStudioSignIn().then((message) => message && setError(message));
  }, []);

  const signIn = async (provider: AuthProvider) => {
    setBusy(true);
    setError(null);
    try {
      track("account_sign_in_started", { provider, placement: "studio" });
      // Native: the OS sheet answers in place and the account state re-renders the gate; the web navigates away.
      if ((await signInToStudio(provider)) !== "redirecting") setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.genericError"));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm leading-relaxed text-ink-soft">{t("plus.signInFirst")}</p>
      {availableProviders().map((provider) => (
        <ProviderButton key={provider} provider={provider} size="lg" disabled={!enabled?.[provider]} busy={busy} onClick={() => void signIn(provider)} />
      ))}
      {error && (
        <p role="alert" className="rounded-xl bg-gold-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
          {error}
        </p>
      )}
    </div>
  );
}
