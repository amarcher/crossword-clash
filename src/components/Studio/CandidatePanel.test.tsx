// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CandidatePanel } from "./CandidatePanel";

afterEach(cleanup);

const words = [
  { word: "SLATE", score: 60 },
  { word: "SAUTE", score: 55 },
  { word: "SPATE", score: 70 },
];

function renderPanel(over: Partial<React.ComponentProps<typeof CandidatePanel>> = {}) {
  const props = {
    slotLabel: "1 Across",
    pattern: "S...E",
    words,
    viability: { SPATE: "nogood" as const, SLATE: "good" as const },
    approved: [],
    rejected: [],
    onPlace: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onClearApprovals: vi.fn(),
    ...over,
  };
  render(<CandidatePanel {...props} />);
  return props;
}

const listed = () => screen.getAllByRole("button").map((b) => b.textContent ?? "").filter((t) => /^[A-Z]{5}$/.test(t));

describe("CandidatePanel", () => {
  it("explains the dots and the two buttons in a legend", () => {
    renderPanel();
    const legend = screen.getByLabelText("Legend");
    expect(legend.textContent).toContain("fills a whole grid");
    expect(legend.textContent).toContain("not checked yet");
    expect(legend.textContent).toContain("never use this word");
  });

  it("sinks words a fill has proven impossible below the rest, whatever their score", () => {
    renderPanel();
    // SPATE scores highest but is proven impossible: last, struck through.
    expect(listed()).toEqual(["SLATE", "SAUTE", "SPATE"]);
    expect(screen.getByRole("button", { name: "SPATE" }).className).toContain("line-through");
  });

  it("lists every rejected word with a Restore, even one no longer among the options", () => {
    const props = renderPanel({ rejected: ["SAUTE", "GONER"] });
    expect(screen.getByText("Rejected everywhere (2)")).toBeTruthy();
    const restore = screen.getAllByRole("button", { name: /Restore/ });
    // The in-list ✕ for SAUTE reads "Restore SAUTE"; the list at the bottom has one Restore per word.
    expect(restore.length).toBe(3);
    fireEvent.click(restore[restore.length - 1]);
    expect(props.onReject).toHaveBeenCalledWith("GONER");
  });

  it("says what red and white squares mean when nothing fits", () => {
    renderPanel({ words: [] });
    expect(screen.getByText(/No word fits every crossing/).textContent).toContain("right-click");
  });
});
