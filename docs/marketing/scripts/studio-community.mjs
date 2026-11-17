// The community list for the short, staged: the list request is answered locally so no test puzzle is published.
import { open } from "./cap.mjs";
const ST = process.env.ST;
const row = (n, title, author, side, clues, difficulty, plays, solves, hoursAgo) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, short_id: `demo${n}`, author_id: `10000000-0000-4000-8000-00000000000${n}`, author, studio_id: `s${n}`, version: 1, status: "published", title, notes: "", difficulty, lang: "en", width: side, height: side, clue_count: clues, puzzle_key: `k${n}`, plays, solves, published_at: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), updated_at: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), removed_reason: null });
const rows = [row(1, "Game Night", "maya", 9, 30, "medium", 14, 9, 1), row(2, "Coffee Break", "priya", 5, 10, "easy", 41, 33, 9), row(3, "Road Trip Playlist", "theo", 11, 46, "medium", 27, 15, 30), row(4, "Movie Marathon", "june", 13, 62, "hard", 19, 6, 52)];
const s = await open("plus", "iphone", ST + "/studio");
let hits = 0;
await s.page.route("**/rest/v1/community_puzzles*", (r) => { hits++; return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": `0-${rows.length - 1}/*` }, body: JSON.stringify(rows) }); });
await s.go("/puzzles", 4500);
await s.shot("community");
console.log("hits", hits, (await s.page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 500));
await s.close();
