// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Select } from "./Select";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
];

function setup(value = "b") {
  const onChange = vi.fn();
  render(<Select aria-label="Fruit" value={value} options={OPTIONS} onChange={onChange} />);
  return { onChange, trigger: screen.getByRole("combobox", { name: "Fruit" }) };
}

describe("Select", () => {
  it("shows the current value and stays closed until pressed", () => {
    const { trigger } = setup();
    expect(trigger.textContent).toBe("Banana");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens a list with the current value marked and picks by click", () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Apple", "Banana", "Cherry"]);
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(options[2]);
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("supports arrows, Enter, Escape and typing a letter", () => {
    const { trigger, onChange } = setup();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("c");

    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(trigger, { key: "a" });
    fireEvent.keyDown(trigger, { key: " " });
    expect(onChange).toHaveBeenLastCalledWith("a");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not report a change when the current value is picked again", () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on a press outside", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders group headings like optgroup", () => {
    render(
      <Select
        aria-label="Voice"
        value=""
        onChange={() => {}}
        options={[
          { value: "", label: "Default" },
          { value: "x", label: "Xavier", group: "en-US" },
          { value: "y", label: "Yvonne", group: "fr-FR" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox").textContent).toContain("en-US");
    expect(screen.getByRole("listbox").textContent).toContain("fr-FR");
  });

  it("is labelled by a wrapping label, like a native select", () => {
    render(
      <label>
        Size
        <Select value="b" options={OPTIONS} onChange={() => {}} />
      </label>,
    );
    expect(screen.getByRole("combobox", { name: /Size/ })).toBeTruthy();
  });
});
