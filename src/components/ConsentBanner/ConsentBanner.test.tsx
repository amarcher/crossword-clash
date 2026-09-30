// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsentBanner } from "./ConsentBanner";
import {
  __resetConsentStoreForTests,
  adsAllowed,
  detectConsentRequirement,
  getConsentState,
  openConsentSettings,
} from "../../lib/consentStore";
import { CONSENT_STORAGE_KEY, makeConsent } from "../../lib/consent";

const geo = (country: string | null) =>
  vi.fn(async () => new Response(JSON.stringify({ country }), { status: 200 })) as unknown as typeof fetch;

describe("consent store detection", () => {
  beforeEach(() => __resetConsentStoreForTests());

  it("asks visitors in a consent region", async () => {
    await detectConsentRequirement(geo("DE"), "America/New_York");
    expect(getConsentState().status).toBe("pending");
    expect(adsAllowed()).toBe(false);
  });

  it("does not ask elsewhere, and allows ads", async () => {
    await detectConsentRequirement(geo("US"), "Europe/Berlin");
    expect(getConsentState().status).toBe("not-required");
    expect(adsAllowed()).toBe(true);
  });

  it("falls back to the timezone when the geo endpoint fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await detectConsentRequirement(failing, "Europe/Paris");
    expect(getConsentState().status).toBe("pending");
  });
});

describe("ConsentBanner", () => {
  let gtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    __resetConsentStoreForTests({ status: "pending" });
  });

  afterEach(cleanup);

  it("offers Accept and Reject with equal weight", () => {
    render(<ConsentBanner />);
    const reject = screen.getByRole("button", { name: "Reject all" });
    const accept = screen.getByRole("button", { name: "Accept all" });
    expect(reject.className).toBe(accept.className);
  });

  it("Reject all stores the choice, denies Google consent, and hides", () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!)).toMatchObject({ analytics: false, ads: false, v: 1 });
    expect(gtag).toHaveBeenCalledWith("consent", "update", expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(adsAllowed()).toBe(false);
  });

  it("Choose lets the visitor allow one category", () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    fireEvent.click(screen.getByRole("switch", { name: /Analytics/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(getConsentState().choice).toMatchObject({ analytics: true, ads: false });
    expect(gtag).toHaveBeenCalledWith("consent", "update", expect.objectContaining({ analytics_storage: "granted", ad_storage: "denied" }));
  });

  it("Cookie settings reopens with the saved choice, and can be closed", () => {
    __resetConsentStoreForTests({ status: "decided", choice: makeConsent(true, true) });
    render(<ConsentBanner />);
    expect(screen.queryByRole("region")).toBeNull();
    act(() => openConsentSettings());
    expect(screen.getByRole("switch", { name: /Advertising/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("stays hidden outside consent regions", () => {
    __resetConsentStoreForTests({ status: "not-required" });
    render(<ConsentBanner />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
