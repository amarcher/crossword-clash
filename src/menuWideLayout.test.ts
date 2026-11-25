import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The wide menu (index.css, "The menu on a wide window") must never reach a
 * phone: every rule that names one of the menu's layout hooks sits inside a
 * media query that starts at lg and needs the window tall enough to hold it,
 * and the arrangements follow the window's shape.
 */
const css = readFileSync(decodeURIComponent(new URL("./index.css", import.meta.url).pathname), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Each rule's selector with the chain of at-rules around it. */
function rules(source: string): { selector: string; within: string[] }[] {
  const out: { selector: string; within: string[] }[] = [];
  const stack: string[] = [];
  let buf = "";
  for (const ch of source) {
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      const head = stack.pop() ?? "";
      if (!head.startsWith("@")) out.push({ selector: head, within: stack.filter((s) => s.startsWith("@")) });
      buf = "";
    } else if (ch === ";" && !stack[stack.length - 1]?.match(/^[^@]/)) {
      buf = "";
    } else buf += ch;
  }
  return out;
}

const HOOK = /\.menu-(page|banner|top|title|notices|grid|lists|foot|dailies)\b|\[data-menu-card\]|\[data-card-/;
const WIDE = "@media (min-width: 64rem) and (min-height: 36rem)";

describe("the wide menu's CSS", () => {
  const hooked = rules(css).filter((r) => HOOK.test(r.selector));

  it("exists, and every rule naming a menu hook is inside the lg-and-tall-enough query", () => {
    expect(hooked.length).toBeGreaterThan(20);
    for (const r of hooked) expect(r.within[0]?.startsWith(WIDE), r.selector).toBe(true);
  });

  it("is one screen tall and scrolls only inside the rail", () => {
    const page = hooked.find((r) => r.within.length === 1 && r.within[0] === WIDE && r.selector === ".menu-page");
    expect(page).toBeTruthy();
    const body = css.slice(css.indexOf(WIDE));
    expect(body).toMatch(/\.menu-page \{[^}]*height: var\(--app-height\);[^}]*overflow: hidden;/);
    expect(body).toMatch(/\.menu-lists \{[^}]*overflow-y: auto;/);
  });

  it("picks the arrangement by the window's shape: 2x2 by default, one row past 21:10, cards over lists squarer than 3:2, 2x2 again upright", () => {
    const queries = new Set(hooked.map((r) => r.within[0]));
    expect(queries).toContain(`${WIDE} and (min-aspect-ratio: 21 / 10)`);
    expect(queries).toContain(`${WIDE} and (max-aspect-ratio: 3 / 2)`);
    expect(queries).toContain(`${WIDE} and (max-aspect-ratio: 1 / 1)`);
    expect(css).toMatch(/\.menu-dailies \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });
});
