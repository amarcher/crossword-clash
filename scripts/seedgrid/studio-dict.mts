/**
 * Writes the studio's word list, public/seedgrid/words.dict (gitignored): the
 * same merge `pnpm seedgrid` uses (base, lively, rescore, blocked), without
 * blocked words. Run after `pnpm seedgrid:dict` or after editing lively.dict
 * or rescore.dict.
 *
 *   pnpm seedgrid:studio-dict
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatDict, mergeDicts, parseDict } from "../../src/lib/seedgrid/dictionary";

const here = path.dirname(fileURLToPath(import.meta.url));
const listFile = (name: string) => path.join(here, "wordlists", name);
if (!fs.existsSync(listFile("base.dict"))) {
  console.error("Missing scripts/seedgrid/wordlists/base.dict. Run `pnpm seedgrid:dict` first.");
  process.exit(1);
}
const load = (name: string) => (fs.existsSync(listFile(name)) ? parseDict(fs.readFileSync(listFile(name), "utf8")) : []);
const entries = mergeDicts(load("base.dict"), load("lively.dict"), load("rescore.dict"), load("blocked.dict"))
  .filter((e) => e.score > 0)
  .sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1));

const out = path.resolve(here, "../../public/seedgrid/words.dict");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, formatDict(entries));
console.log(`${entries.length} words → public/seedgrid/words.dict (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
