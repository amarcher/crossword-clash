// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "./ConfirmProvider";

let ask: (o: ConfirmOptions) => Promise<boolean>;

function Harness() {
  ask = useConfirm();
  return <button>opener</button>;
}

function setup() {
  render(
    <ConfirmProvider>
      <Harness />
    </ConfirmProvider>,
  );
  const opener = screen.getByText("opener");
  opener.focus();
  return opener;
}

/** Start a confirm and capture its eventual result. */
function open(o: ConfirmOptions) {
  const result: { value?: boolean } = {};
  act(() => {
    void ask(o).then((v) => {
      result.value = v;
    });
  });
  return result;
}

const flush = () => act(async () => {});

afterEach(cleanup);

describe("ConfirmProvider", () => {
  it("renders an accessible dialog and resolves true on confirm", async () => {
    setup();
    const result = open({ title: "Sure?", body: "Really.", confirmLabel: "Yes" });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText("Sure?")).toBeTruthy();
    fireEvent.click(screen.getByText("Yes"));
    await flush();
    expect(result.value).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses alertdialog for danger tone and focuses Cancel first", () => {
    setup();
    open({ title: "Delete", tone: "danger", confirmLabel: "Delete" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByText("Cancel"));
  });

  it("focuses the confirm button for default tone", () => {
    setup();
    open({ title: "Go", confirmLabel: "Go now" });
    expect(document.activeElement).toBe(screen.getByText("Go now"));
  });

  it("Escape cancels and restores focus to the opener", async () => {
    const opener = setup();
    const result = open({ title: "T" });
    expect(document.activeElement).not.toBe(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(result.value).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("backdrop click cancels", async () => {
    setup();
    const result = open({ title: "T" });
    fireEvent.click(screen.getByTestId("confirm-backdrop"));
    await flush();
    expect(result.value).toBe(false);
  });

  it("traps Tab inside the dialog", () => {
    setup();
    open({ title: "T", confirmLabel: "OKAY" });
    const ok = screen.getByText("OKAY");
    const cancel = screen.getByText("Cancel");
    ok.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  it("queues concurrent requests and shows them one at a time", async () => {
    setup();
    const first = open({ title: "First", confirmLabel: "A" });
    const second = open({ title: "Second", confirmLabel: "B" });
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByText("Second")).toBeNull();
    fireEvent.click(screen.getByText("A"));
    await flush();
    expect(first.value).toBe(true);
    expect(screen.getByText("Second")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(second.value).toBe(false);
  });

  it("useConfirm throws outside a provider", () => {
    function Bad() {
      useConfirm();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/ConfirmProvider/);
  });
});
