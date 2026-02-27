// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { useRef } from "react";
import { MobileClueBar } from "./MobileClueBar";
import type { PuzzleClue } from "../../types/puzzle";

afterEach(cleanup);

const sampleClue: PuzzleClue = {
  direction: "across",
  number: 1,
  text: "Feline friend",
  row: 0,
  col: 0,
  length: 3,
  answer: "CAT",
};

function makeProps(overrides: Partial<Parameters<typeof MobileClueBar>[0]> = {}) {
  return {
    activeClue: sampleClue,
    direction: "across" as const,
    onPrevWord: vi.fn(),
    onNextWord: vi.fn(),
    onOpenSheet: vi.fn(),
    onToggleDirection: vi.fn(),
    ...overrides,
  };
}

// Helper that renders with a real inputRef attached to a visible input element.
// Returns the rendered container, the focus spy, and the bar element.
function renderWithInputRef(props: ReturnType<typeof makeProps>) {
  let capturedRef: React.RefObject<HTMLInputElement | null> | undefined;

  function Wrapper() {
    const inputRef = useRef<HTMLInputElement | null>(null);
    capturedRef = inputRef;
    return (
      <>
        <input data-testid="hidden-input" ref={inputRef} />
        <MobileClueBar {...props} inputRef={inputRef} />
      </>
    );
  }

  const result = render(<Wrapper />);
  const focusSpy = vi.spyOn(capturedRef!.current!, "focus");
  return { ...result, focusSpy };
}

describe("MobileClueBar rendering", () => {
  it("renders the active clue number and text", () => {
    const { container } = render(<MobileClueBar {...makeProps()} />);
    expect(within(container).getByText("1. Feline friend")).toBeTruthy();
  });

  it("renders placeholder text when activeClue is null", () => {
    const { container } = render(<MobileClueBar {...makeProps({ activeClue: null })} />);
    expect(within(container).getByText("Tap a cell to start")).toBeTruthy();
  });

  it("shows 'A' badge when direction is across", () => {
    const { container } = render(<MobileClueBar {...makeProps({ direction: "across" })} />);
    expect(within(container).getByText("A")).toBeTruthy();
  });

  it("shows 'D' badge when direction is down", () => {
    const { container } = render(<MobileClueBar {...makeProps({ direction: "down" })} />);
    expect(within(container).getByText("D")).toBeTruthy();
  });
});

describe("MobileClueBar button callbacks without inputRef", () => {
  it("calls onPrevWord when prev button is clicked", () => {
    const props = makeProps();
    const { container } = render(<MobileClueBar {...props} />);
    fireEvent.click(within(container).getByLabelText("Previous clue"));
    expect(props.onPrevWord).toHaveBeenCalledTimes(1);
  });

  it("calls onNextWord when next button is clicked", () => {
    const props = makeProps();
    const { container } = render(<MobileClueBar {...props} />);
    fireEvent.click(within(container).getByLabelText("Next clue"));
    expect(props.onNextWord).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleDirection when direction toggle button is clicked", () => {
    const props = makeProps();
    const { container } = render(<MobileClueBar {...props} />);
    fireEvent.click(within(container).getByLabelText(/Direction:/i));
    expect(props.onToggleDirection).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenSheet when the clue text area is clicked", () => {
    const props = makeProps();
    const { container } = render(<MobileClueBar {...props} />);
    fireEvent.click(within(container).getByText("1. Feline friend"));
    expect(props.onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it("does not crash when inputRef is not provided", () => {
    const props = makeProps();
    const { container } = render(<MobileClueBar {...props} />);
    expect(() => {
      fireEvent.click(within(container).getByLabelText("Previous clue"));
      fireEvent.click(within(container).getByLabelText("Next clue"));
      fireEvent.click(within(container).getByLabelText(/Direction:/i));
    }).not.toThrow();
  });
});

describe("MobileClueBar inputRef focus behavior", () => {
  it("focuses inputRef when prev button is clicked", () => {
    const props = makeProps();
    const { container, focusSpy } = renderWithInputRef(props);
    fireEvent.click(within(container).getByLabelText("Previous clue"));
    expect(props.onPrevWord).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("focuses inputRef when next button is clicked", () => {
    const props = makeProps();
    const { container, focusSpy } = renderWithInputRef(props);
    fireEvent.click(within(container).getByLabelText("Next clue"));
    expect(props.onNextWord).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("focuses inputRef when direction toggle button is clicked", () => {
    const props = makeProps();
    const { container, focusSpy } = renderWithInputRef(props);
    fireEvent.click(within(container).getByLabelText(/Direction:/i));
    expect(props.onToggleDirection).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("does not focus inputRef when clue text area is clicked", () => {
    const props = makeProps();
    const { container, focusSpy } = renderWithInputRef(props);
    fireEvent.click(within(container).getByText("1. Feline friend"));
    expect(props.onOpenSheet).toHaveBeenCalledTimes(1);
    expect(focusSpy).not.toHaveBeenCalled();
  });
});
