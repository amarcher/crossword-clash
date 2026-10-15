// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import i18n from "../i18n/i18n";

afterEach(() => {
  cleanup();
  i18n.changeLanguage("en");
});

describe("LanguageSwitcher", () => {
  it("renders a select element", () => {
    render(<LanguageSwitcher />);
    const select = screen.getByRole("combobox");
    expect(select).toBeDefined();
    expect(select.getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("renders an option for each supported language", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe("English");
    expect(options[1].textContent).toBe("Espa\u00f1ol");
  });

  it("reflects the current language as selected value", () => {
    render(<LanguageSwitcher />);
    const select = screen.getByRole("combobox");
    expect(select.textContent).toBe("English");
  });

  it("changes language when a different option is selected", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Espa\u00f1ol" }));
    expect(i18n.language).toBe("es");
  });

  it("lists each language by its own name", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["English", "Espa\u00f1ol"]);
  });
});
