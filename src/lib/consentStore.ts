import { useSyncExternalStore } from "react";
import {
  CONSENT_STORAGE_KEY,
  isConsentRegion,
  makeConsent,
  parseConsent,
  timezoneSuggestsConsentRegion,
  toGoogleConsent,
  type ConsentChoice,
} from "./consent";

/**
 * - `detecting`: no stored choice yet; still working out whether consent is needed.
 * - `not-required`: visitor is outside CONSENT_REGIONS; Google defaults apply.
 * - `pending`: consent is required and the visitor hasn't chosen yet.
 * - `decided`: a stored choice exists (from any region).
 */
export type ConsentStatus = "detecting" | "not-required" | "pending" | "decided";

export interface ConsentState {
  status: ConsentStatus;
  choice: ConsentChoice | null;
  /** True while the visitor has the settings panel open (banner or reopened). */
  settingsOpen: boolean;
}

type Gtag = (...args: unknown[]) => void;

function readStored(): ConsentChoice | null {
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

const stored = typeof window === "undefined" ? null : readStored();
let state: ConsentState = {
  status: stored ? "decided" : "detecting",
  choice: stored,
  settingsOpen: false,
};
const listeners = new Set<() => void>();

function setState(next: Partial<ConsentState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConsentState(): ConsentState {
  return state;
}

export function useConsent(): ConsentState {
  return useSyncExternalStore(subscribe, getConsentState, getConsentState);
}

/** Whether ads (AdSense) may load for this visitor right now. */
export function adsAllowed(s: ConsentState = state): boolean {
  if (s.status === "not-required") return true;
  return s.status === "decided" && !!s.choice?.ads;
}

export function saveConsent(analytics: boolean, ads: boolean) {
  const choice = makeConsent(analytics, ads);
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  (window as unknown as { gtag?: Gtag }).gtag?.("consent", "update", toGoogleConsent(choice));
  setState({ status: "decided", choice, settingsOpen: false });
}

export function openConsentSettings() {
  setState({ settingsOpen: true });
}

export function closeConsentSettings() {
  setState({ settingsOpen: false });
}

/**
 * Resolve whether this visitor needs to be asked. Uses the Vercel geo header
 * via /api/geo; falls back to the timezone when that isn't reachable.
 */
export async function detectConsentRequirement(
  fetchImpl: typeof fetch = fetch,
  timeZone: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<void> {
  if (state.status !== "detecting") return;
  let required: boolean;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const res = await fetchImpl("/api/geo", { signal: controller.signal, cache: "no-store" });
    window.clearTimeout(timer);
    if (!res.ok) throw new Error(`geo ${res.status}`);
    const body = (await res.json()) as { country?: string | null };
    required = body.country ? isConsentRegion(body.country) : timezoneSuggestsConsentRegion(timeZone);
  } catch {
    required = timezoneSuggestsConsentRegion(timeZone);
  }
  if (state.status === "detecting") setState({ status: required ? "pending" : "not-required" });
}

/** Test-only: reset module state. */
export function __resetConsentStoreForTests(next?: Partial<ConsentState>) {
  state = { status: "detecting", choice: null, settingsOpen: false, ...next };
  listeners.forEach((l) => l());
}
