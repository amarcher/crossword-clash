// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Suspense } from "react";
import i18n from "../../i18n/i18n";
import { NotFoundScreen } from "../NotFoundScreen";
import { RouteErrorScreen } from "../RouteErrorScreen";
import { CHUNK_RELOAD_KEY } from "../../lib/chunkReload";
import { LEGAL_CONTENT, LEGAL_LAST_UPDATED } from "./legalContent";
import { PrivacyScreen } from "./PrivacyScreen";
import { TermsScreen } from "./TermsScreen";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

describe("legal content", () => {
  it("en and es have the same structure", () => {
    for (const kind of ["privacy", "terms"] as const) {
      const en = LEGAL_CONTENT.en[kind].sections;
      const es = LEGAL_CONTENT.es[kind].sections;
      expect(es.length).toBe(en.length);
      en.forEach((s, i) => {
        expect(es[i].paragraphs?.length ?? 0).toBe(s.paragraphs?.length ?? 0);
        expect(es[i].items?.length ?? 0).toBe(s.items?.length ?? 0);
      });
    }
  });

  it("contains no real email address, only the placeholder", () => {
    const all = JSON.stringify(LEGAL_CONTENT);
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(all).toContain("[CONTACT EMAIL]");
  });

  it("renders privacy and terms with the last-updated date, in both languages", async () => {
    const { unmount } = render(<PrivacyScreen />, { wrapper: Router });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy Policy");
    expect(screen.getByText(`Last updated: ${LEGAL_LAST_UPDATED}`)).toBeTruthy();
    unmount();
    await i18n.changeLanguage("es");
    render(<TermsScreen />, { wrapper: Router });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Términos de uso");
    expect(screen.getByText(`Última actualización: ${LEGAL_LAST_UPDATED}`)).toBeTruthy();
  });
});

function Router({ children }: { children: React.ReactNode }) {
  const router = createMemoryRouter([{ path: "*", element: <Suspense>{children}</Suspense> }]);
  return <RouterProvider router={router} />;
}

describe("NotFoundScreen", () => {
  it("shows friendly copy and a link to the menu", () => {
    render(<NotFoundScreen />, { wrapper: Router });
    expect(screen.getByText("Page not found")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Back to menu" });
    expect(link.getAttribute("href")).toBe("/");
  });
});

describe("RouteErrorScreen", () => {
  function boom(message: string) {
    return createMemoryRouter([
      {
        path: "/",
        loader: () => {
          throw new TypeError(message);
        },
        element: null,
        errorElement: <RouteErrorScreen />,
      },
    ]);
  }

  it("shows a branded error with reload + menu actions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RouterProvider router={boom("kaboom")} />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to menu" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull();
  });

  it("auto-reloads once for a stale chunk, then falls back to the screen", async () => {
    sessionStorage.clear();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<RouterProvider router={boom("Failed to fetch dynamically imported module: /a.js")} />);
    expect(await screen.findByText("A new version is available")).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeTruthy();
  });
});
