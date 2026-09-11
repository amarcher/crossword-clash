import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
import { useGame } from "../contexts/GameContext";
import { importNativeNytPuzzle, loadNativeNytImport, nativeNytImportAvailable } from "../lib/nativeNytImport";
import { isPuzzleDate, nytPuzzleUrl } from "../lib/nytImport";
import type { NytPuzzleKind } from "../lib/nytImport";

function newYorkDate(): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}

export function NytImportScreen() {
  const { t } = useTranslation();
  const game = useGame();
  const navigate = useNavigate();
  const [date, setDate] = useState(newYorkDate);
  const [kind, setKind] = useState<NytPuzzleKind>("daily");
  const [saved, setSaved] = useState(loadNativeNytImport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const native = nativeNytImportAvailable();

  async function openImporter() {
    if (busy || !isPuzzleDate(date)) return;
    setBusy(true); setError("");
    try {
      const puzzle = await importNativeNytPuzzle(nytPuzzleUrl(kind, date), {
        close: t("nytImport.close"), selected: t("nytImport.selected"), import: t("nytImport.import"),
        working: t("nytImport.working"), hint: t("nytImport.hint"), external: t("nytImport.external"),
        PAGE: t("nytImport.pageError"), ACCESS: t("nytImport.accessError"), NETWORK: t("nytImport.networkError"),
        FORMAT: t("nytImport.formatError"), UNSUPPORTED: t("nytImport.unsupportedError"),
      });
      if (puzzle) setSaved(puzzle);
    } catch { setError(t("nytImport.saveError")); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-dvh crossword-bg px-5 py-8">
      <div className="mx-auto max-w-md">
        <Title className="mb-6" />
        <Link to="/menu" className="inline-block py-3 text-sm text-blue-700">← {t("nytImport.back")}</Link>
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">{t("nytImport.eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-bold text-neutral-900">{t("nytImport.title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">{t("nytImport.description")}</p>
          {native ? <>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <label className="text-sm text-neutral-700">{t("nytImport.puzzle")}
                <select value={kind} onChange={e => setKind(e.target.value as NytPuzzleKind)} disabled={busy}
                  className="mt-1 block min-h-12 w-full rounded-lg border border-neutral-300 bg-white px-3">
                  <option value="daily">{t("nytImport.daily")}</option><option value="mini">{t("nytImport.mini")}</option>
                </select>
              </label>
              <label className="text-sm text-neutral-700">{t("nytImport.date")}
                <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy}
                  className="mt-1 block min-h-12 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-2" />
              </label>
            </div>
            <button onClick={openImporter} disabled={busy || !isPuzzleDate(date)}
              className="mt-5 min-h-12 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {busy ? t("nytImport.working") : t("nytImport.open")}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">{t("nytImport.session")}</p>
          </> : <>
            <p className="mt-5 text-sm text-neutral-600">{t("nytImport.webOnly")}</p>
            <a href="/install-bookmarklet" className="mt-3 inline-block py-3 font-semibold text-blue-700">{t("nytImport.bookmarklet")} →</a>
          </>}
          {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        </section>
        {saved && <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-6" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">{t("nytImport.saved")}</p>
          <h2 className="mt-2 text-xl font-bold text-neutral-900">{saved.title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{saved.author} · {saved.width}×{saved.height}</p>
          <p className="mt-3 text-sm text-neutral-600">{t("nytImport.local")}</p>
          <button className="mt-4 min-h-12 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white" onClick={() => {
            game.setUrlPuzzle(saved); navigate("/puzzle-ready");
          }}>{t("nytImport.continue")}</button>
        </section>}
      </div>
    </main>
  );
}
