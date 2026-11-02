import type { MouseEventHandler } from "react";
import { useTranslation } from "react-i18next";
import type { AuthProvider } from "../../lib/account";
import "./providerButton.css";

export type ProviderButtonSize = "md" | "lg";
/** Which background the button sits on. The app's account surfaces are all light; a dark surface flips both brands to their light-on-dark variant. */
export type ProviderButtonScheme = "light" | "dark";

interface ProviderButtonProps {
  provider: AuthProvider;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  /** A sign-in is under way (the OAuth redirect, or the OS sheet): the button is disabled and marked busy for assistive tech. */
  busy?: boolean;
  /** `md` = 44 px (Apple's minimum), `lg` = 48 px, the height of the app's large buttons. Both providers in one stack take the same size. */
  size?: ProviderButtonSize;
  scheme?: ProviderButtonScheme;
  className?: string;
}

/**
 * The official-looking Sign in with Apple / Sign in with Google buttons, as a
 * styled HTML button around the existing `signInWith` handlers — no native
 * view is involved. Apple reviews the Apple button against its Human
 * Interface Guidelines (App Store guideline 4.8), so both follow their brand
 * rules: the Apple logo on a black button in the system font (white with a
 * 1 px border on a dark surface), the four-colour "G" on a white button with
 * Google's #747775 border and Roboto Medium 14 px; the same height, radius
 * and width for both, so Apple's is never the less prominent one. The label
 * keeps the `account.continueApple` / `account.continueGoogle` strings
 * ("Continue with …" is one of the HIG's permitted titles).
 */
export function ProviderButton({ provider, onClick, disabled, busy, size = "lg", scheme = "light", className = "" }: ProviderButtonProps) {
  const { t } = useTranslation();
  const label = provider === "apple" ? t("account.continueApple") : t("account.continueGoogle");
  const isBusy = !!busy;

  return (
    <button
      type="button"
      data-provider={provider}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      onClick={onClick}
      className={`${BASE} ${SIZES[size]} ${STYLES[provider][scheme]} ${className}`.trim()}
    >
      {provider === "apple" ? <AppleLogo /> : <GoogleLogo />}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

// Layout shared by both brands: logo at the left, label centred in the rest,
// 12 px side padding (Google's spec), the app's corner radius, no transform or
// shadow games — the brand guidelines ask for a plain button.
const BASE =
  "relative inline-flex w-full select-none items-center justify-center gap-3 rounded-xl border px-3 whitespace-nowrap transition-[background-color,border-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-45";

const SIZES: Record<ProviderButtonSize, string> = {
  md: "h-11",
  lg: "h-12",
};

const STYLES: Record<AuthProvider, Record<ProviderButtonScheme, string>> = {
  apple: {
    // HIG: black button, white logo and title, no border needed; the border colour matches the fill so both schemes share one box.
    light: "provider-button-apple border-black bg-black text-[17px] font-semibold text-white active:bg-neutral-800",
    // HIG: white button with black logo and title and a 1 px outline on dark backgrounds.
    dark: "provider-button-apple border-black bg-white text-[17px] font-semibold text-black active:bg-neutral-200",
  },
  google: {
    // Google branding, light theme: #FFFFFF fill, #747775 1 px border, #1F1F1F label.
    light: "provider-button-google border-[#747775] bg-white text-[14px] font-medium text-[#1F1F1F] active:bg-[#F2F2F2]",
    // Google branding, dark theme: #131314 fill, #8E918F border, #E3E3E3 label.
    dark: "provider-button-google border-[#8E918F] bg-[#131314] text-[14px] font-medium text-[#E3E3E3] active:bg-[#1F1F20]",
  },
};

/** The Apple logo, drawn in the current text colour at the HIG's proportions (the glyph is taller than wide). */
function AppleLogo() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 814 1000" className="h-5 w-auto shrink-0 fill-current" data-logo="apple">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

/** Google's four-colour "G", at its brand colours whatever the button's scheme (the guidelines never recolour it). */
function GoogleLogo() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className="size-5 shrink-0" data-logo="google">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
