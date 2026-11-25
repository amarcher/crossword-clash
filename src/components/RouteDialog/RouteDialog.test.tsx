// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider, useLocation } from "react-router";
import { useState } from "react";
import "../../i18n/i18n";
import { DIALOG_QUERY, DIALOG_ROUTE, DialogOutlet, useOnDialogClose } from "./RouteDialog";
import { PageShell } from "../PageShell";
import { FlowPage } from "../Flow";

function viewport(wide: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: wide && query === DIALOG_QUERY, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

let menuMounts = 0;
function Menu() {
  // Counts mounts: the page under a dialog must stay mounted, not be rebuilt.
  useState(() => ++menuMounts);
  return (
    <main>
      <h1>Menu page</h1>
      <Link to="/race">Open race</Link>
    </main>
  );
}

function Other() {
  return (
    <main>
      <h1>Other page</h1>
      <Link to="/race">Race from other</Link>
    </main>
  );
}

function Race() {
  return (
    <PageShell width="md" widthLg="5xl" bar={{ backLabel: "Back to menu", backTo: "/menu" }} heading={{ title: "Race friends" }}>
      <Link to="/race/friends">Manage friends</Link>
    </PageShell>
  );
}

function Friends() {
  return (
    <PageShell width="md" widthLg="5xl" bar={{ backLabel: "Race friends", backTo: "/race" }} heading={{ title: "Friends" }}>
      <p>Friend list</p>
    </PageShell>
  );
}

let joinCloses = 0;
function Join() {
  useOnDialogClose(() => joinCloses++);
  return (
    <FlowPage title="Join a room" onBack={() => {}} backLabel="Back to menu">
      <input aria-label="Room code" autoFocus />
      <Link to="/other">Joined</Link>
    </FlowPage>
  );
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function Layout() {
  return (
    <>
      <DialogOutlet fallback={<Menu />} />
      <Where />
    </>
  );
}

function renderAt(entries: string[], index?: number) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: Layout,
        children: [
          { path: "menu", Component: Menu },
          { path: "other", Component: Other },
          { path: "race", handle: DIALOG_ROUTE, Component: Race },
          { path: "race/friends", handle: DIALOG_ROUTE, Component: Friends },
          { path: "join", handle: DIALOG_ROUTE, Component: Join },
        ],
      },
    ],
    { initialEntries: entries, initialIndex: index },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const where = () => screen.getByTestId("where").textContent;

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
  menuMounts = 0;
  joinCloses = 0;
});

describe("route dialogs", () => {
  it("is a full page below lg: the site bar and the page's own title, nothing underneath", () => {
    viewport(false);
    renderAt(["/race"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Race friends" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to menu/ })).toBeTruthy();
    expect(screen.queryByText("Menu page")).toBeNull();
  });

  it("opens over the page it came from at lg, which stays mounted and inert, and Close returns to it", async () => {
    viewport(true);
    const router = renderAt(["/other"]);
    const opener = screen.getByRole("link", { name: "Race from other" });
    opener.focus();
    await act(() => router.navigate("/race"));

    const dialog = screen.getByRole("dialog", { name: "Race friends" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Dialog chrome, not the page: no site bar, no h1, the title in the title row.
    expect(within(dialog).queryByRole("link", { name: /Back to menu/ })).toBeNull();
    expect(within(dialog).queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("Other page").closest("[inert]")).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(where()).toBe("/other");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Race from other" }));
  });

  it("keeps the page under it mounted through open and close", async () => {
    viewport(true);
    const router = renderAt(["/menu"]);
    expect(menuMounts).toBe(1);
    await act(() => router.navigate("/race"));
    expect(screen.getByText("Menu page")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(where()).toBe("/menu");
    expect(menuMounts).toBe(1);
  });

  it("closes on Escape and on the backdrop, returning focus to the control that opened it", async () => {
    viewport(true);
    const router = renderAt(["/menu"]);
    screen.getByRole("link", { name: "Open race" }).focus();
    await act(() => router.navigate("/race"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(where()).toBe("/menu");
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Open race" }));

    await act(() => router.navigate("/race"));
    fireEvent.click(screen.getByTestId("route-dialog-backdrop"));
    expect(where()).toBe("/menu");
  });

  it("shows a cold deep link over the menu", () => {
    viewport(true);
    renderAt(["/join"]);
    const dialog = screen.getByRole("dialog", { name: "Join a room" });
    expect(screen.getByText("Menu page").closest("[inert]")).toBeTruthy();
    // The screen's own focus (the code field) is kept, not taken by the dialog.
    expect(document.activeElement).toBe(within(dialog).getByRole("textbox", { name: "Room code" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(where()).toBe("/menu");
  });

  it("steps between dialog routes in one dialog, with a back step and Close going to the page underneath", async () => {
    viewport(true);
    const router = renderAt(["/other"]);
    await act(() => router.navigate("/race"));
    fireEvent.click(screen.getByRole("link", { name: "Manage friends" }));
    const dialog = await screen.findByRole("dialog", { name: "Friends" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).getByRole("link", { name: "Race friends" }).getAttribute("href")).toBe("/race");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(where()).toBe("/other");
  });

  it("traps Tab inside the dialog", async () => {
    viewport(true);
    const router = renderAt(["/menu"]);
    await act(() => router.navigate("/race"));
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close" });
    const last = within(dialog).getByRole("link", { name: "Manage friends" });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("tells the screen when its dialog is closed (Close, Escape, the backdrop), never when it navigates on", async () => {
    viewport(true);
    const router = renderAt(["/menu"]);
    await act(() => router.navigate("/join"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(joinCloses).toBe(1);
    await act(() => router.navigate("/join"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await act(() => router.navigate("/join"));
    fireEvent.click(screen.getByTestId("route-dialog-backdrop"));
    expect(joinCloses).toBe(3);
    // Leaving by its own navigation (a join landing in its lobby) is not a close.
    await act(() => router.navigate("/join"));
    fireEvent.click(screen.getByRole("link", { name: "Joined" }));
    expect(where()).toBe("/other");
    expect(joinCloses).toBe(3);
  });

  it("closes nothing on a phone, where the screen is a page", () => {
    viewport(false);
    renderAt(["/join"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(joinCloses).toBe(0);
  });
});
