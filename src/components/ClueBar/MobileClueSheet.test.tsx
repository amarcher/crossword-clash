// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { useRef } from "react";
import { MobileClueSheet } from "./MobileClueSheet";

afterEach(cleanup);

// The play screen's shape: the grid's hidden input, focused while solving, and the sheet over it.
function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input ref={inputRef} aria-label="grid" />
      <MobileClueSheet open={open} onClose={onClose} inputRef={inputRef} scoreboard={<div>score</div>} cluePanel={<button>1. A clue</button>} />
    </>
  );
}

function backdrop() {
  return screen.getByRole("dialog").previousElementSibling as HTMLElement;
}

describe("MobileClueSheet", () => {
  it("takes focus off the grid while open, so the keyboard makes room for the clues", () => {
    const { getByLabelText } = render(<Harness open={false} onClose={() => {}} />);
    getByLabelText("grid").focus();
    cleanup();
    render(<Harness open onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByText("1. A clue"));
  });

  it("focuses the grid again inside the backdrop tap, before the sheet closes, so the keyboard comes back with the puzzle", () => {
    const onClose = vi.fn(() => {
      // Still the user's gesture: the grid must already hold focus here.
      expect(document.activeElement).toBe(screen.getByLabelText("grid"));
    });
    render(<Harness open onClose={onClose} />);
    expect(document.activeElement).not.toBe(screen.getByLabelText("grid"));
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("grid"));
  });

  it("does the same for Escape", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("grid"));
  });

  it("closes without a grid to focus", () => {
    const onClose = vi.fn();
    render(<MobileClueSheet open onClose={onClose} scoreboard={null} cluePanel={<button>clue</button>} />);
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
