// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  hasNarratorDemoRemaining,
  narratorDemoRemaining,
  consumeNarratorDemo,
} from "./narratorDemo";
import { DEFAULT_DEMO_EVENT_ALLOWANCE } from "./narratorBudget";

describe("narratorDemo", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with the full allowance", () => {
    expect(narratorDemoRemaining()).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE);
    expect(hasNarratorDemoRemaining()).toBe(true);
  });

  it("decrements as demo events are consumed", () => {
    expect(consumeNarratorDemo()).toBe(true);
    expect(narratorDemoRemaining()).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE - 1);
  });

  it("stops granting once the allowance is exhausted", () => {
    for (let i = 0; i < DEFAULT_DEMO_EVENT_ALLOWANCE; i++) {
      expect(consumeNarratorDemo()).toBe(true);
    }
    expect(narratorDemoRemaining()).toBe(0);
    expect(hasNarratorDemoRemaining()).toBe(false);
    expect(consumeNarratorDemo()).toBe(false);
  });

  it("persists consumption across calls", () => {
    consumeNarratorDemo();
    consumeNarratorDemo();
    expect(narratorDemoRemaining()).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE - 2);
  });

  it("treats corrupted storage as a fresh allowance", () => {
    localStorage.setItem("crossword-clash-narrator-demo", "not-a-number");
    expect(narratorDemoRemaining()).toBe(DEFAULT_DEMO_EVENT_ALLOWANCE);
  });
});
