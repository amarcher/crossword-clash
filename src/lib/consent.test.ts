import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONSENT_REGIONS,
  isConsentRegion,
  makeConsent,
  parseConsent,
  timezoneSuggestsConsentRegion,
  toGoogleConsent,
} from "./consent";

describe("consent regions", () => {
  it("covers the 27 EU states, the other EEA countries, the UK and Switzerland", () => {
    expect(CONSENT_REGIONS).toHaveLength(32);
    for (const code of ["DE", "FR", "IE", "IS", "LI", "NO", "GB", "CH"]) expect(isConsentRegion(code)).toBe(true);
  });

  it("is case-insensitive and rejects everything else", () => {
    expect(isConsentRegion("de")).toBe(true);
    for (const code of ["US", "CA", "BR", "TR", "RU", "", null, undefined]) expect(isConsentRegion(code)).toBe(false);
  });

  it("matches the Consent Mode region list in both Google tag snippets", () => {
    for (const file of ["index.html", "bookmarklet/install-page.html"]) {
      const path = decodeURIComponent(new URL(`../../${file}`, import.meta.url).pathname);
      const html = new TextDecoder().decode(readFileSync(path));
      const match = html.match(/ad_personalization: 'denied', wait_for_update: 500, region: (\[[^\]]+\])/);
      expect(match, `${file} should set region-scoped consent defaults`).toBeTruthy();
      expect(JSON.parse(match![1])).toEqual([...CONSENT_REGIONS]);
    }
  });
});

describe("timezone fallback", () => {
  it("errs on the side of asking in Europe", () => {
    expect(timezoneSuggestsConsentRegion("Europe/Berlin")).toBe(true);
    expect(timezoneSuggestsConsentRegion("Europe/London")).toBe(true);
    expect(timezoneSuggestsConsentRegion("Atlantic/Canary")).toBe(true);
  });

  it("does not ask elsewhere", () => {
    expect(timezoneSuggestsConsentRegion("America/New_York")).toBe(false);
    expect(timezoneSuggestsConsentRegion("Asia/Tokyo")).toBe(false);
    expect(timezoneSuggestsConsentRegion(undefined)).toBe(false);
  });
});

describe("stored choice", () => {
  it("round-trips", () => {
    const choice = makeConsent(true, false, 123);
    expect(parseConsent(JSON.stringify(choice))).toEqual(choice);
  });

  it("ignores missing, corrupt, or other-version values", () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("{not json")).toBeNull();
    expect(parseConsent(JSON.stringify({ v: 2, analytics: true, ads: true }))).toBeNull();
    expect(parseConsent(JSON.stringify({ v: 1, analytics: "yes", ads: true }))).toBeNull();
  });

  it("maps to Google Consent Mode v2 fields", () => {
    expect(toGoogleConsent({ analytics: true, ads: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });
});
