import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PencilRuler } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui";
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
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <PencilRuler className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold leading-snug tracking-tight text-ink">{t("studio.gateTitle")}</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("studio.gateBody")}</p>
            </div>
          </div>
          <div className="mt-5">
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
          </div>
        </section>
      )}
    </GateShell>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="md" background="canvas" bar={{ backLabel: "Menu", backTo: "/menu" }}>
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
        <Button key={provider} variant="secondary" size="lg" block disabled={busy || !enabled?.[provider]} aria-busy={busy || undefined} onClick={() => void signIn(provider)}>
          {provider === "apple" ? t("account.continueApple") : t("account.continueGoogle")}
        </Button>
      ))}
      {error && (
        <p role="alert" className="rounded-xl bg-gold-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
          {error}
        </p>
      )}
    </div>
  );
}
