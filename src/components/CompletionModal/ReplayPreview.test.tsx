// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "../../i18n/i18n";
import { ReplayPreview } from "./ReplayPreview";

afterEach(cleanup);

describe("ReplayPreview", () => {
  it("holds the clip's place under the link's real title while the clip is being filed", () => {
    const { rerender } = render(<ReplayPreview title="Archer solved the Daily Mini in 1:42" pending />);
    // The picture's box is there before the clip, so the clip's arrival moves nothing below it.
    expect(screen.getByTestId("replay-preview-pending").className).toContain("aspect-video");
    expect(screen.getByTestId("link-preview-title").textContent).toContain("Archer solved the Daily Mini in 1:42");

    rerender(<ReplayPreview id="VJ0ncnWyJ9j" title="Archer solved the Daily Mini in 1:42" />);
    expect(screen.queryByTestId("replay-preview-pending")).toBeNull();
    expect(screen.getByTestId("replay-preview").querySelector("video")?.className).toContain("aspect-video");
  });

  it("holds the whole preview's place when the title is not known either", () => {
    render(<ReplayPreview pending />);
    expect(screen.getByTestId("replay-preview-pending")).toBeTruthy();
    expect(screen.queryByTestId("replay-preview")).toBeNull();
  });

  it("shows nothing with no clip, no title and nothing on its way", () => {
    const { container } = render(<ReplayPreview />);
    expect(container.firstChild).toBeNull();
  });
});
