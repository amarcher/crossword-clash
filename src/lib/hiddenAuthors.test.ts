// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_AUTHORS_KEY, hideAuthor, isAuthorHidden, loadHiddenAuthors, resetHiddenAuthorsMemory, subscribeHiddenAuthors, unhideAuthor } from "./hiddenAuthors";

beforeEach(() => {
  localStorage.clear();
  resetHiddenAuthorsMemory();
});

describe("hiddenAuthors", () => {
  it("hides and unhides on this device, newest first, notifying listeners", () => {
    const listener = vi.fn();
    const off = subscribeHiddenAuthors(listener);
    hideAuthor("a");
    hideAuthor("b");
    hideAuthor("a");
    expect(loadHiddenAuthors()).toEqual(["b", "a"]);
    expect(isAuthorHidden("a")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unhideAuthor("a");
    unhideAuthor("zzz");
    expect(loadHiddenAuthors()).toEqual(["b"]);
    expect(JSON.parse(localStorage.getItem(HIDDEN_AUTHORS_KEY)!)).toEqual(["b"]);
    off();
    unhideAuthor("b");
    expect(listener).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem(HIDDEN_AUTHORS_KEY)).toBeNull();
  });

  it("ignores junk in storage", () => {
    localStorage.setItem(HIDDEN_AUTHORS_KEY, '{"not":"a list"}');
    expect(loadHiddenAuthors()).toEqual([]);
    resetHiddenAuthorsMemory();
    localStorage.setItem(HIDDEN_AUTHORS_KEY, '["ok", 3, null]');
    expect(loadHiddenAuthors()).toEqual(["ok"]);
  });
});
