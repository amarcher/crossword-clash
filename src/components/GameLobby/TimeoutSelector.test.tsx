// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TimeoutSelector } from "./TimeoutSelector";

afterEach(cleanup);

describe("TimeoutSelector", () => {
  it("renders all preset options", () => {
    render(<TimeoutSelector value={0} onChange={() => {}} />);
    expect(screen.getByText("Off")).toBeDefined();
    expect(screen.getByText("1s")).toBeDefined();
    expect(screen.getByText("2s")).toBeDefined();
    expect(screen.getByText("3s")).toBeDefined();
    expect(screen.getByText("5s")).toBeDefined();
  });

  it("renders the heading", () => {
    render(<TimeoutSelector value={0} onChange={() => {}} />);
    expect(screen.getByText("Wrong Answer Penalty")).toBeDefined();
  });

  it("highlights the selected option", () => {
    render(<TimeoutSelector value={3} onChange={() => {}} />);
    const btn = screen.getByText("3s");
    expect(btn.className).toContain("bg-blue-600");
    expect(btn.className).toContain("text-white");
  });

  it("does not highlight unselected options", () => {
    render(<TimeoutSelector value={3} onChange={() => {}} />);
    const off = screen.getByText("Off");
    expect(off.className).not.toContain("bg-blue-600");
  });

  it("calls onChange with correct value when clicked", () => {
    const onChange = vi.fn();
    render(<TimeoutSelector value={0} onChange={onChange} />);
    fireEvent.click(screen.getByText("2s"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("calls onChange when switching from one value to another", () => {
    const onChange = vi.fn();
    render(<TimeoutSelector value={3} onChange={onChange} />);
    fireEvent.click(screen.getByText("Off"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("applies dark variant styles to unselected options", () => {
    render(<TimeoutSelector value={1} onChange={() => {}} variant="dark" />);
    const off = screen.getByText("Off");
    expect(off.className).toContain("bg-neutral-700");
  });

  it("applies light variant styles by default to unselected options", () => {
    render(<TimeoutSelector value={1} onChange={() => {}} />);
    const off = screen.getByText("Off");
    expect(off.className).toContain("bg-neutral-100");
  });

  it("applies dark variant styles to heading", () => {
    render(<TimeoutSelector value={0} onChange={() => {}} variant="dark" />);
    const heading = screen.getByText("Wrong Answer Penalty");
    expect(heading.className).toContain("text-neutral-400");
  });
});
