// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TransitionLink } from "./TransitionLink";
import { prefetchRoute } from "../../routeModules";
import { navigateWithTransition } from "../../lib/transitionNavigate";

vi.mock("../../routeModules", () => ({ prefetchRoute: vi.fn(() => null) }));
vi.mock("../../lib/transitionNavigate", () => ({ navigateWithTransition: vi.fn(async () => {}) }));

const mockPrefetch = vi.mocked(prefetchRoute);
const mockNavigate = vi.mocked(navigateWithTransition);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(props: Partial<React.ComponentProps<typeof TransitionLink>> = {}) {
  const onClick = vi.fn();
  render(
    <MemoryRouter>
      <TransitionLink to="/classics" onClick={onClick} {...props}>
        Classics
      </TransitionLink>
    </MemoryRouter>,
  );
  return { onClick, link: screen.getByRole("link", { name: "Classics" }) };
}

describe("TransitionLink", () => {
  it("renders a real link to the path", () => {
    const { link } = setup();
    expect(link.getAttribute("href")).toBe("/classics");
  });

  it("warms the route on pointer enter, focus and touch start", () => {
    const { link } = setup();
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    fireEvent.touchStart(link);
    expect(mockPrefetch).toHaveBeenCalledTimes(3);
    expect(mockPrefetch).toHaveBeenCalledWith("/classics");
  });

  it("navigates with the transition on a plain click, after the caller's onClick", () => {
    const { link, onClick } = setup({ replace: true });
    fireEvent.click(link, { button: 0 });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expect.any(Function), "/classics", { replace: true });
  });

  it("leaves modified clicks and target links to the browser", () => {
    const { link } = setup();
    fireEvent.click(link, { button: 0, metaKey: true });
    fireEvent.click(link, { button: 0, ctrlKey: true });
    fireEvent.click(link, { button: 1 });
    expect(mockNavigate).not.toHaveBeenCalled();
    cleanup();
    const { link: blank } = setup({ target: "_blank" });
    fireEvent.click(blank, { button: 0 });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does nothing more when the caller's onClick prevented the default", () => {
    const { link } = setup({ onClick: (e) => e.preventDefault() });
    fireEvent.click(link, { button: 0 });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
