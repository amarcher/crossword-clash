import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useHydrated } from "../lib/hydration";
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL, isAndroidBrowser, isIosBrowser, isIosSafari } from "../lib/platform";
import { track } from "../lib/analytics";

/** localStorage: when the visitor last closed the banner (ms). */
export const APP_BANNER_DISMISSED_KEY = "crossword-clash:app-banner-dismissed";
/** A closed banner stays away this long, then asks once more. */
export const APP_BANNER_QUIET_MS = 30 * 86400_000;

function dismissedRecently(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(APP_BANNER_DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && now - at < APP_BANNER_QUIET_MS;
  } catch {
    return false;
  }
}

/** The Play link with its own referrer, so Play Console tells banner installs from menu-row ones. */
const playBannerUrl = (url: string) => url.replace("utm_medium%3Dmenu", "utm_medium%3Dbanner");

type Store = { kind: "ios" | "android"; href: string };

/** Which store to offer this browser, or null. Safari is left to Apple's own Smart App Banner. */
function storeFor(): Store | null {
  if (isIosBrowser()) return IOS_APP_STORE_URL && !isIosSafari() ? { kind: "ios", href: IOS_APP_STORE_URL } : null;
  if (isAndroidBrowser() && ANDROID_PLAY_STORE_URL) return { kind: "android", href: playBannerUrl(ANDROID_PLAY_STORE_URL) };
  return null;
}

/**
 * Our own "get the app" banner, drawn like Apple's Smart App Banner (a strip
 * across the top: icon, name and subtitle, a blue Get pill, close),
 * for the phone browsers that show none of their own: iPhone and iPad browsers
 * other than Safari (Chrome, Firefox, in-app browsers ignore the
 * `apple-itunes-app` meta; Safari shows Apple's, so this never doubles it) and
 * Android browsers that can reach Google Play (Chrome has no Smart App Banner
 * equivalent). Closing it keeps it away for 30 days on this device. Never in
 * the apps, never before hydration (the prerendered menu has no user agent).
 */
export function AppStoreBanner({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const [closed, setClosed] = useState(false);
  const store = hydrated && !closed && import.meta.env.MODE !== "mobile" && !dismissedRecently() ? storeFor() : null;
  if (!store) return null;

  const close = () => {
    try {
      localStorage.setItem(APP_BANNER_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Private mode: it just comes back next visit.
    }
    track("app_banner_dismissed", { placement: "banner", store: store.kind });
    setClosed(true);
  };
  const ios = store.kind === "ios";

  return (
    <section
      aria-label={t("appBanner.label")}
      className={`flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur ${className}`}
    >
      <img
        src="/apple-touch-icon.png"
        alt=""
        width={56}
        height={56}
        className="size-14 shrink-0 rounded-[13px] ring-1 ring-black/5"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-ink">{t("appBanner.title")}</p>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted">{t("appBanner.subtitle")}</p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <a
          href={store.href}
          onClick={() => track(ios ? "app_store_click" : "play_store_click", { placement: "banner" })}
          className="inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-full bg-[#0a7cff] px-4 text-[15px] font-semibold text-white active:bg-[#0062d6]"
        >
          {t(ios ? "appBanner.get" : "appBanner.install")}
        </a>
        <span className="text-[10px] leading-tight text-muted">{t("appBanner.inAppPurchases")}</span>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={t("appBanner.dismiss")}
        className="-mr-1.5 grid size-11 shrink-0 place-items-center"
      >
        <span className="grid size-8 place-items-center rounded-full bg-surface-sunken text-[#0a7cff] active:bg-line">
          <X className="size-4" strokeWidth={2.5} aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
