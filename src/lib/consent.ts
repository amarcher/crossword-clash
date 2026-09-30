/**
 * Cookie consent for visitors where opt-in consent is required (EEA, UK,
 * Switzerland). Pure helpers; the React-facing store lives in consentStore.ts.
 *
 * Google tags read the same choice: index.html (and the static bookmarklet
 * page) set Consent Mode v2 defaults to "denied" for CONSENT_REGIONS and
 * replay a stored choice before GA4 configures, so a returning visitor's
 * decision applies from the first hit.
 */

export const CONSENT_STORAGE_KEY = "crossword-clash:consent";
export const CONSENT_VERSION = 1;

export interface ConsentChoice {
  analytics: boolean;
  ads: boolean;
  v: typeof CONSENT_VERSION;
  /** Epoch ms the choice was made. */
  ts: number;
}

/**
 * EU member states + the other EEA countries (Iceland, Liechtenstein, Norway),
 * the UK and Switzerland. Keep in sync with the `region` array in index.html
 * and bookmarklet/install-page.html (consent.test.ts enforces this).
 */
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB", "CH",
] as const;

const REGION_SET: ReadonlySet<string> = new Set(CONSENT_REGIONS);

export function isConsentRegion(country: string | null | undefined): boolean {
  return !!country && REGION_SET.has(country.toUpperCase());
}

/**
 * Fallback when the geo endpoint is unavailable (local dev, network error):
 * guess from the IANA timezone. Deliberately over-inclusive — showing the
 * banner to someone who didn't need it is harmless; skipping it is not.
 */
export function timezoneSuggestsConsentRegion(timeZone: string | undefined): boolean {
  if (!timeZone) return false;
  return (
    timeZone.startsWith("Europe/") ||
    /^Atlantic\/(Azores|Madeira|Canary|Reykjavik|Faroe)$/.test(timeZone)
  );
}

export function parseConsent(raw: string | null): ConsentChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentChoice>;
    if (value?.v !== CONSENT_VERSION) return null;
    if (typeof value.analytics !== "boolean" || typeof value.ads !== "boolean") return null;
    return { analytics: value.analytics, ads: value.ads, v: CONSENT_VERSION, ts: Number(value.ts) || 0 };
  } catch {
    return null;
  }
}

export function makeConsent(analytics: boolean, ads: boolean, now: number = Date.now()): ConsentChoice {
  return { analytics, ads, v: CONSENT_VERSION, ts: now };
}

type GrantState = "granted" | "denied";

/** Google Consent Mode v2 fields for a choice. */
export function toGoogleConsent(choice: Pick<ConsentChoice, "analytics" | "ads">): Record<string, GrantState> {
  const ads: GrantState = choice.ads ? "granted" : "denied";
  return {
    analytics_storage: choice.analytics ? "granted" : "denied",
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  };
}
