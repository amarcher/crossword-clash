import { describe, expect, it, vi } from "vitest";
import { initErrorReporting, isErrorReportingEnabled, reportError } from "./errorReporting";

describe("errorReporting (no DSN)", () => {
  it("is disabled when VITE_SENTRY_DSN is unset", () => {
    expect(isErrorReportingEnabled()).toBe(false);
  });

  it("reportError is a silent no-op and never throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportError(new Error("boom"), { op: "test" })).not.toThrow();
    expect(() => reportError("a string", undefined)).not.toThrow();
    expect(() => reportError(undefined)).not.toThrow();
    spy.mockRestore();
  });

  it("ignores stale-chunk errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new TypeError("Failed to fetch dynamically imported module: /a.js"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("initErrorReporting is idempotent and does not throw", () => {
    expect(() => {
      initErrorReporting();
      initErrorReporting();
    }).not.toThrow();
  });
});
