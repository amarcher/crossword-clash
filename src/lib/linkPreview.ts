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

/** "archer vs minna" for two named solvers; else how many raced (api/share.ts `raceHeadline`). */
function raceHeadline(racers: number, names: string[]): string {
  if (names.length === 2) return `${names[0]} vs ${names[1]}`;
  return racers === 2 ? "A head-to-head race" : racers > 2 ? `A ${racers}-way race` : "A race";
}

/**
 * The title a solve's share link (dailyChallenge.ts `buildPuzzleLink`) will
 * unfurl with, or null for a link that is not a timed solve of a daily, a
 * Daily Plus or a community puzzle. `communityTitle` is the puzzle's own
 * title, which the server looks up from the link's id. A shared race (a clip
 * with no time to beat) is titled by who raced.
 */
export function linkPreviewTitle(link: string, communityTitle?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(link, "https://crosswordclash.com");
  } catch {
    return null;
  }
  const beat = url.searchParams.get("beat") ?? "";
  const daily = /^\/daily\/(\d{4}-\d{2}-\d{2})\/(mini|midi|large)$/.exec(url.pathname);
  const bonus = /^\/bonus\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
  const community = /^\/puzzles\/[a-z0-9]{8}$/.test(url.pathname);
  const named = communityTitle?.trim() ? `“${communityTitle.trim()}”` : "a community crossword";
  if (beat === "" && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("r") ?? "")) {
    const n = Number(url.searchParams.get("race") ?? "");
    const racers = Number.isInteger(n) && n >= 1 && n <= 8 ? n : 0;
    const names = (url.searchParams.get("who") ?? "").split(",").map((w) => w.replace(/\s+/g, " ").trim().slice(0, 20)).filter(Boolean);
    const headline = raceHeadline(racers, racers > 0 && names.length === racers ? names : []);
    if (daily) return `${headline} on the ${SLOT_LABEL[daily[2]]} for ${formatDay(daily[1])}`;
    if (bonus) return `${headline} on the Daily Plus for ${formatDay(bonus[1])}`;
    if (community) return `${headline} on ${named}`;
    return null;
  }
  if (!/^\d{1,6}$/.test(beat)) return null;
  const time = formatSeconds(Number(beat));
  const who = (url.searchParams.get("by") ?? "").trim();
  if (daily) return solveTitle(who, `the ${formatDay(daily[1])} ${SLOT_LABEL[daily[2]]}`, time);
  if (bonus) return solveTitle(who, `the ${formatDay(bonus[1])} Daily Plus`, time);
  if (community) return solveTitle(who, named, time);
  return null;
}
