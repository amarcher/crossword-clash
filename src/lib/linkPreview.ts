/**
 * What a shared solve's link says when it unfurls in a message (the og:title
 * api/share.ts serves), so the finish screen can show the sender exactly
 * that. api/share.ts is outside this project and cannot import this file: its
 * `solveTitle` is a copy, and linkPreview.test.ts fails when the two differ.
 */

const SLOT_LABEL: Record<string, string> = { mini: "Daily Mini", midi: "Daily Midi", large: "Daily Large" };

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
  );
}

/** "Archer solved the Nov 18 Daily Mini in 1:02": `what` is the puzzle as the sentence names it. */
export function solveTitle(who: string, what: string, time: string): string {
  return `${who || "I"} solved ${what} in ${time}`;
}

/**
 * The title a solve's share link (dailyChallenge.ts `buildPuzzleLink`) will
 * unfurl with, or null for a link that is not a timed solve of a daily, a
 * Daily Plus or a community puzzle. `communityTitle` is the puzzle's own
 * title, which the server looks up from the link's id.
 */
export function linkPreviewTitle(link: string, communityTitle?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(link, "https://crosswordclash.com");
  } catch {
    return null;
  }
  const beat = url.searchParams.get("beat") ?? "";
  if (!/^\d{1,6}$/.test(beat)) return null;
  const time = formatSeconds(Number(beat));
  const who = (url.searchParams.get("by") ?? "").trim();
  const daily = /^\/daily\/(\d{4}-\d{2}-\d{2})\/(mini|midi|large)$/.exec(url.pathname);
  if (daily) return solveTitle(who, `the ${formatDay(daily[1])} ${SLOT_LABEL[daily[2]]}`, time);
  const bonus = /^\/bonus\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
  if (bonus) return solveTitle(who, `the ${formatDay(bonus[1])} Daily Plus`, time);
  if (/^\/puzzles\/[a-z0-9]{8}$/.test(url.pathname)) return solveTitle(who, communityTitle?.trim() ? `“${communityTitle.trim()}”` : "a community crossword", time);
  return null;
}
