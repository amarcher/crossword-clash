// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ActiveClueBar } from "./ActiveClueBar";

afterEach(cleanup);

describe("ActiveClueBar", () => {
  it("shows the whole entry on its own line above the input, never truncated", () => {
    render(<ActiveClueBar slotLabel="19 Across" answer="GAMENIGHT" clue="" onChange={() => {}} onPrev={() => {}} onNext={() => {}} options={[]} />);
    const answer = screen.getByTestId("active-clue-answer");
    expect(answer.textContent).toBe("GAMENIGHT");
    expect(answer.className).not.toMatch(/\btruncate\b/);
    expect(answer.className).toMatch(/break-all/);
    const input = screen.getByLabelText("Clue for 19 Across");
    // The label line comes before the input in the same column.
    expect(answer.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.className).toMatch(/\bw-full\b/);
  });
});
