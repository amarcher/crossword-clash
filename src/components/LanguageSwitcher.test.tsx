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
    expect(select.tagName).toBe("SELECT");
  });

  it("renders an option for each supported language", () => {
    render(<LanguageSwitcher />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe("English");
    expect(options[1].textContent).toBe("Espanol");
  });

  it("reflects the current language as selected value", () => {
    render(<LanguageSwitcher />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("en");
  });

  it("changes language when a different option is selected", () => {
    render(<LanguageSwitcher />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "es" } });
    expect(i18n.language).toBe("es");
  });

  it("option values match supported language codes", () => {
    render(<LanguageSwitcher />);
    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options[0].value).toBe("en");
    expect(options[1].value).toBe("es");
  });
});
