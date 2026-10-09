/**
 * Display names are the only free text other players see (lobbies, scoreboards,
 * the public daily leaderboard), so objectionable ones are swapped for the
 * anonymous default both when a name is sent and when someone else's is shown.
 * Filtering on read matters most: it also covers names written by older
 * clients or by anyone talking to the API directly.
 */

const FALLBACK_NAME = "Player";

/** Matched anywhere in the squashed name — long enough not to hit real words. */
const BLOCKED_ANYWHERE = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard",
  "whore", "slut", "rapist", "nazi", "hitler", "asshole", "dickhead",
  "pussy", "cocksuck", "wetback", "tranny", "kike", "spic", "chink",
  "pendejo", "puta", "puto", "maricon", "mierda", "cabron", "verga", "zorra",
];

/** Short or ambiguous words: only when they stand alone as a word. */
const BLOCKED_WORDS = new Set(["ass", "cock", "dick", "fag", "cum", "tit", "tits", "rape", "kkk", "hoe", "coño", "culo", "joto"]);

/** Words that legitimately contain a blocked run ("Scunthorpe problem"). */
const ALLOWED = ["computa", "disputa", "reputa", "diputa", "amputa", "imputa", "putar", "spice", "spicy", "despic", "hospic", "conspic", "auspic", "suspic", "shitake", "shiitake", "scunthorpe"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function squash(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0134578@$!]/g, (c) => LEET[c] ?? c);
}

export function isObjectionableName(name: string): boolean {
  const lower = squash(name);
  const words = lower.split(/[^a-zñ]+/).filter(Boolean);
  if (words.some((w) => BLOCKED_WORDS.has(w))) return true;
  let joined = lower.replace(/[^a-zñ]/g, "");
  for (const ok of ALLOWED) joined = joined.split(ok).join(" ");
  return BLOCKED_ANYWHERE.some((bad) => joined.includes(bad));
}

/** The name as it may be shown to or stored for others. */
export function displayableName(name: string | null | undefined, fallback = FALLBACK_NAME): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  return isObjectionableName(trimmed) ? fallback : trimmed;
}
