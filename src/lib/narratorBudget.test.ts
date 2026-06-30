import { describe, it, expect } from "vitest";
import {
  estimateRowCostUsd,
  estimateMonthlySpendUsd,
  evaluateBudget,
  resolveMonthlyCapUsd,
  rateKeyForRow,
  demoEventsRemaining,
  hasDemoRemaining,
  canGrantDemo,
  DEFAULT_MONTHLY_CAP_USD,
  DEFAULT_DEMO_EVENT_ALLOWANCE,
  DEFAULT_DEMO_GRANT_LIMIT,
  NARRATOR_UNAVAILABLE_BODY,
  type UsageRow,
} from "./narratorBudget";

describe("narratorBudget", () => {
  describe("rateKeyForRow", () => {
    it("prefers model id", () => {
      expect(rateKeyForRow({ model: "gpt-realtime", service: "openai" })).toBe("gpt-realtime");
    });
    it("falls back to service:endpoint when no model", () => {
      expect(rateKeyForRow({ service: "elevenlabs", endpoint: "tts" })).toBe("elevenlabs:tts");
    });
    it("falls back to bare service, then unknown", () => {
      expect(rateKeyForRow({ service: "elevenlabs" })).toBe("elevenlabs");
      expect(rateKeyForRow({})).toBe("unknown");
    });
  });

  describe("estimateRowCostUsd", () => {
    it("prices Claude token rows by input/output rate", () => {
      const row: UsageRow = {
        service: "anthropic",
        model: "claude-sonnet-4-20250514",
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
      };
      // $3 input + $15 output
      expect(estimateRowCostUsd(row)).toBeCloseTo(18, 6);
    });

    it("prices TTS rows by character", () => {
      const row: UsageRow = { service: "elevenlabs", endpoint: "tts", characters: 10_000 };
      expect(estimateRowCostUsd(row)).toBeCloseTo(1.5, 6);
    });

    it("prices per-session models by row count", () => {
      expect(estimateRowCostUsd({ model: "convai", rows: 3 })).toBeCloseTo(3.0, 6);
      expect(estimateRowCostUsd({ model: "gpt-realtime", rows: 2 })).toBeCloseTo(3.0, 6);
    });

    it("defaults session row count to 1", () => {
      expect(estimateRowCostUsd({ model: "convai" })).toBeCloseTo(1.0, 6);
    });

    it("treats unknown rate keys and negative numbers as zero", () => {
      expect(estimateRowCostUsd({ model: "mystery-model", tokensIn: 1000 })).toBe(0);
      expect(estimateRowCostUsd({ model: "claude-sonnet-4-20250514", tokensIn: -50 })).toBe(0);
    });
  });

  describe("estimateMonthlySpendUsd", () => {
    it("sums across mixed rows", () => {
      const rows: UsageRow[] = [
        { model: "claude-sonnet-4-20250514", tokensIn: 1_000_000, tokensOut: 0 }, // $3
        { service: "elevenlabs", endpoint: "tts", characters: 10_000 }, // $1.50
        { model: "convai", rows: 2 }, // $2.00
      ];
      expect(estimateMonthlySpendUsd(rows)).toBeCloseTo(6.5, 6);
    });

    it("returns 0 for empty usage", () => {
      expect(estimateMonthlySpendUsd([])).toBe(0);
    });
  });

  describe("evaluateBudget", () => {
    const cap = 20;

    it("is UNDER cap with light usage", () => {
      const rows: UsageRow[] = [{ model: "convai", rows: 3 }]; // $3
      const status = evaluateBudget(rows, cap);
      expect(status.overCap).toBe(false);
      expect(status.spendUsd).toBeCloseTo(3, 6);
      expect(status.remainingUsd).toBeCloseTo(17, 6);
    });

    it("is AT cap exactly (>= is over)", () => {
      const rows: UsageRow[] = [{ model: "convai", rows: 20 }]; // exactly $20
      const status = evaluateBudget(rows, cap);
      expect(status.spendUsd).toBeCloseTo(20, 6);
      expect(status.overCap).toBe(true);
      expect(status.remainingUsd).toBe(0);
    });

    it("is OVER cap with heavy usage", () => {
      const rows: UsageRow[] = [
        { model: "gpt-realtime", rows: 20 }, // $30
        { service: "elevenlabs", endpoint: "tts", characters: 50_000 }, // $7.50
      ];
      const status = evaluateBudget(rows, cap);
      expect(status.overCap).toBe(true);
      expect(status.remainingUsd).toBe(0);
    });

    it("is UNDER cap with EMPTY usage", () => {
      const status = evaluateBudget([], cap);
      expect(status.spendUsd).toBe(0);
      expect(status.overCap).toBe(false);
      expect(status.remainingUsd).toBe(cap);
    });
  });

  describe("resolveMonthlyCapUsd", () => {
    it("uses the default when unset/blank", () => {
      expect(resolveMonthlyCapUsd(undefined)).toBe(DEFAULT_MONTHLY_CAP_USD);
      expect(resolveMonthlyCapUsd(null)).toBe(DEFAULT_MONTHLY_CAP_USD);
      expect(resolveMonthlyCapUsd("   ")).toBe(DEFAULT_MONTHLY_CAP_USD);
    });
    it("parses a numeric env value", () => {
      expect(resolveMonthlyCapUsd("50")).toBe(50);
      expect(resolveMonthlyCapUsd("12.5")).toBe(12.5);
    });
    it("rejects non-positive / non-numeric values", () => {
      expect(resolveMonthlyCapUsd("0")).toBe(DEFAULT_MONTHLY_CAP_USD);
      expect(resolveMonthlyCapUsd("-5")).toBe(DEFAULT_MONTHLY_CAP_USD);
      expect(resolveMonthlyCapUsd("abc")).toBe(DEFAULT_MONTHLY_CAP_USD);
    });
    it("honors a custom fallback", () => {
      expect(resolveMonthlyCapUsd(undefined, 7)).toBe(7);
    });
  });

  describe("demo allowance", () => {
    it("counts remaining demo events", () => {
      expect(demoEventsRemaining(0)).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE);
      expect(demoEventsRemaining(2)).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE - 2);
      expect(demoEventsRemaining(DEFAULT_DEMO_EVENT_ALLOWANCE)).toBe(0);
      expect(demoEventsRemaining(999)).toBe(0);
      expect(demoEventsRemaining(-3)).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE);
    });

    it("reports whether any demo remains", () => {
      expect(hasDemoRemaining(0)).toBe(true);
      expect(hasDemoRemaining(DEFAULT_DEMO_EVENT_ALLOWANCE)).toBe(false);
    });

    it("grants demos only for eligible endpoints, when requested, under the IP limit", () => {
      const base = { endpoint: "narrator-claude", priorGrants: 0, demoRequested: true };
      expect(canGrantDemo(base)).toBe(true);
      // not requested
      expect(canGrantDemo({ ...base, demoRequested: false })).toBe(false);
      // ineligible (expensive) endpoint
      expect(canGrantDemo({ ...base, endpoint: "agent-auth" })).toBe(false);
      expect(canGrantDemo({ ...base, endpoint: "openai-agent-auth" })).toBe(false);
      // over the per-IP grant limit
      expect(canGrantDemo({ ...base, priorGrants: DEFAULT_DEMO_GRANT_LIMIT })).toBe(false);
      // tts is eligible
      expect(canGrantDemo({ ...base, endpoint: "tts" })).toBe(true);
    });
  });

  it("exposes the machine-readable unavailable signal", () => {
    expect(NARRATOR_UNAVAILABLE_BODY).toEqual({ error: "narrator_unavailable", reason: "budget" });
  });
});
