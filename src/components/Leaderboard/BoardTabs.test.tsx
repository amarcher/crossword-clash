// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";
import { BoardTabs } from "./BoardTabs";

afterEach(cleanup);

it("a phone gets a tab per daily, the shown one marked, a past day carried across", () => {
  render(<BoardTabs active="midi" day="2026-11-10" />, { wrapper: MemoryRouter });
  const tabs = screen.getAllByRole("link");
  expect(tabs.map((a) => a.textContent)).toEqual(["Mini", "Midi", "Large"]);
  expect(tabs.map((a) => a.getAttribute("href"))).toEqual(["/daily/leaderboard?day=2026-11-10", "/daily/leaderboard/midi?day=2026-11-10", "/daily/leaderboard/large?day=2026-11-10"]);
  expect(tabs.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
});

it("shows nothing when there is only one board to show", () => {
  const { container } = render(<BoardTabs active="mini" day={null} slots={["mini"]} />, { wrapper: MemoryRouter });
  expect(container.firstChild).toBeNull();
});
