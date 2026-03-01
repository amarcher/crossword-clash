// @vitest-environment jsdom
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { Trans } from "react-i18next";
import "../../i18n/i18n";

describe("Trans link rendering", () => {
  test("nytHint renders a clickable anchor with correct text", () => {
    const { container } = render(
      <p>
        <Trans
          i18nKey="importer.nytHint"
          components={{
            strong: <strong className="text-neutral-500" />,
            anchor: (
              <a
                href="/install-bookmarklet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              />
            ),
          }}
        />
      </p>,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBe(1);
    expect(anchors[0].textContent).toBe("NYT Bookmarklet");
    expect(anchors[0].getAttribute("href")).toBe("/install-bookmarklet");
  });

  test("scraperHint renders a clickable anchor with correct text", () => {
    const { container } = render(
      <p>
        <Trans
          i18nKey="importer.scraperHint"
          components={{
            anchor: (
              <a
                href="https://example.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              />
            ),
          }}
        />
      </p>,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBe(1);
    expect(anchors[0].textContent).toBe("Crossword Scraper");
  });

  test("nytHint renders strong tag with correct text", () => {
    const { container } = render(
      <p>
        <Trans
          i18nKey="importer.nytHint"
          components={{
            strong: <strong />,
            anchor: <a href="/install-bookmarklet" />,
          }}
        />
      </p>,
    );
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("NYT subscriber?");
  });
});
