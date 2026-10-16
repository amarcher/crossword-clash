import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "../ui";
import { accountName, fetchEnabledProviders, resumeStudioSignIn, signInToStudio, signOutOfStudio, type StudioProvider } from "../../lib/studioAuth";
import type { StudioAccount as Account } from "../../hooks/useStudioAccount";

const PROVIDERS: { id: StudioProvider; label: string }[] = [
  { id: "apple", label: "Continue with Apple" },
  { id: "google", label: "Continue with Google" },
];

/**
 * The studio's sign-in control, in the top bar: "Sign in" opens Apple and
 * Google; once signed in it shows who you are, whether you're a studio admin,
 * and "Sign out". Only the studio has accounts; players stay anonymous.
 */
export function StudioAccount({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<StudioProvider, boolean> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Finish (or report) a sign-in that just came back from the provider.
  useEffect(() => {
    void resumeStudioSignIn().then((message) => {
      if (!message) return;
      setError(message);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (open && !account.user && !enabled) void fetchEnabledProviders().then(setEnabled);
  }, [open, account.user, enabled]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const signOut = () =>
    void act(async () => {
      await signOutOfStudio();
      setBusy(false);
      setOpen(false);
    });

  if (!account.ready) return null;
  const { user } = account;
  const name = user ? accountName(user) : "";

  return (
    <div ref={root} className="relative">
      {user ? (
        <button
          type="button"
          className="inline-flex h-9 max-w-44 items-center gap-2 rounded-full bg-surface-sunken p-1 text-sm font-medium text-ink hover:bg-line active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500 sm:pr-3"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
          {/* Phones show just the initial; the top bar has no room for a name. */}
          <span className="truncate max-sm:sr-only">{name}</span>
        </button>
      ) : (
        <Button variant="secondary" size="sm" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
          <LogIn className="size-4" aria-hidden="true" /> <span className="max-[359px]:sr-only">Sign in</span>
        </Button>
      )}

      {open && (
        <div role="dialog" aria-label={user ? "Account" : "Sign in"} className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-line bg-surface p-3 shadow-lg">
          {user ? (
            <>
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              {user.email && user.email !== name && <p className="truncate text-xs text-muted">{user.email}</p>}
              <p className="mt-2 text-xs text-ink-soft">
                {account.admin ? "Studio admin: Claude drafting and the daily queue need no token." : "Not a studio admin yet, so Claude drafting and the daily queue still need the studio token."}
              </p>
              <Button variant="ghost" size="sm" className="mt-2 w-full" disabled={busy} onClick={signOut}>
                <LogOut className="size-4" aria-hidden="true" /> Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Sign in to use the studio as yourself.</p>
              <div className="mt-2 flex flex-col gap-2">
                {PROVIDERS.map((p) => (
                  <Button key={p.id} variant="secondary" className="w-full" disabled={busy || !enabled?.[p.id]} onClick={() => void act(() => signInToStudio(p.id))}>
                    {p.label}
                  </Button>
                ))}
              </div>
              {enabled && !enabled.apple && !enabled.google && (
                <p className="mt-2 text-xs text-muted">Neither provider is switched on in Supabase yet.</p>
              )}
            </>
          )}
          {error && <p role="alert" className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs text-ink-soft">{error}</p>}
        </div>
      )}
    </div>
  );
}
