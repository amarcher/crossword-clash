// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProviderButton } from "./ProviderButton";

afterEach(cleanup);

function both(extra: { disabled?: boolean; busy?: boolean; size?: "md" | "lg"; scheme?: "light" | "dark" } = {}) {
  const onApple = vi.fn();
  const onGoogle = vi.fn();
  render(
    <div>
      <ProviderButton provider="apple" onClick={onApple} {...extra} />
      <ProviderButton provider="google" onClick={onGoogle} {...extra} />
    </div>,
  );
  return {
    onApple,
    onGoogle,
    apple: screen.getByRole("button", { name: "Continue with Apple" }),
    google: screen.getByRole("button", { name: "Continue with Google" }),
  };
}

describe("ProviderButton", () => {
  it("renders both brands by their accessible names, each with a hidden logo", () => {
    const { apple, google, onApple, onGoogle } = both();
    const appleLogo = apple.querySelector("svg");
    const googleLogo = google.querySelector("svg");
    expect(appleLogo?.getAttribute("aria-hidden")).toBe("true");
    expect(googleLogo?.getAttribute("aria-hidden")).toBe("true");
    expect(appleLogo?.getAttribute("data-logo")).toBe("apple");
    expect(googleLogo?.getAttribute("data-logo")).toBe("google");
    // Google's "G" keeps its four brand colours; Apple's logo takes the button's text colour.
    expect(googleLogo?.querySelectorAll("path[fill]").length).toBe(4);
    expect(appleLogo?.getAttribute("class")).toContain("fill-current");

    fireEvent.click(apple);
    fireEvent.click(google);
    expect(onApple).toHaveBeenCalledTimes(1);
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });

  it("follows the brand rules: Apple black with the system font, Google white with the #747775 border in Roboto", () => {
    const { apple, google } = both();
    expect(apple.className).toContain("bg-black");
    expect(apple.className).toContain("text-white");
    expect(apple.className).toContain("provider-button-apple");
    expect(google.className).toContain("bg-white");
    expect(google.className).toContain("border-[#747775]");
    expect(google.className).toContain("text-[14px]");
    expect(google.className).toContain("provider-button-google");
    expect(apple.className).toContain("rounded-xl");
    expect(google.className).toContain("rounded-xl");
  });

  it("flips both to their dark-surface variant", () => {
    const { apple, google } = both({ scheme: "dark" });
    expect(apple.className).toContain("bg-white");
    expect(apple.className).toContain("text-black");
    expect(apple.className).toContain("border-black");
    expect(google.className).toContain("bg-[#131314]");
    expect(google.className).toContain("border-[#8E918F]");
  });

  it("renders both at the same height class, full width, 44 px at the smallest", () => {
    const lg = both();
    expect(lg.apple.className).toContain("h-12");
    expect(lg.google.className).toContain("h-12");
    expect(lg.apple.className).toContain("w-full");
    expect(lg.google.className).toContain("w-full");
    cleanup();
    const md = both({ size: "md" });
    expect(md.apple.className).toContain("h-11");
    expect(md.google.className).toContain("h-11");
    expect(md.apple.className).not.toContain("h-12");
  });

  it("disabled and busy states", () => {
    const off = both({ disabled: true });
    expect((off.apple as HTMLButtonElement).disabled).toBe(true);
    expect((off.google as HTMLButtonElement).disabled).toBe(true);
    expect(off.apple.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(off.apple);
    expect(off.onApple).not.toHaveBeenCalled();
    cleanup();

    const busy = both({ busy: true });
    expect((busy.apple as HTMLButtonElement).disabled).toBe(true);
    expect(busy.apple.getAttribute("aria-busy")).toBe("true");
    expect(busy.google.getAttribute("aria-busy")).toBe("true");
    cleanup();

    const idle = both();
    expect((idle.apple as HTMLButtonElement).disabled).toBe(false);
    expect(idle.apple.getAttribute("aria-busy")).toBeNull();
  });
});
