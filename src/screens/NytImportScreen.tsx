import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Newspaper } from "lucide-react";
import { SiteBar } from "../components/SiteBar";
import { Button, Card, Eyebrow, buttonClass } from "../components/ui";
import { useGame } from "../contexts/GameContext";
import { importNativeNytPuzzle, loadNativeNytImport, nativeNytImportAvailable } from "../lib/nativeNytImport";
import { isPuzzleDate, nytPuzzleUrl } from "../lib/nytImport";
import type { NytPuzzleKind } from "../lib/nytImport";

function newYorkDate(): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}

const FIELD =
  "mt-1.5 block min-h-12 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:opacity-60 md:text-sm";

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
    <main className="min-h-dvh crossword-bg px-4 pb-10 pt-2">
      <SiteBar backTo="/menu" backLabel={t("nytImport.back")} />
      <div className="mx-auto mt-4 grid w-full max-w-md gap-4">
        <Card className="p-5 sm:p-6">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Newspaper className="size-5.5" aria-hidden="true" />
          </span>
          <Eyebrow className="mt-4 text-brand-600">{t("nytImport.eyebrow")}</Eyebrow>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{t("nytImport.title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("nytImport.description")}</p>
          {native ? <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-ink-soft">{t("nytImport.puzzle")}
                <select value={kind} onChange={e => setKind(e.target.value as NytPuzzleKind)} disabled={busy} className={FIELD}>
                  <option value="daily">{t("nytImport.daily")}</option><option value="mini">{t("nytImport.mini")}</option>
                </select>
              </label>
              <label className="text-sm font-medium text-ink-soft">{t("nytImport.date")}
                <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy} className={FIELD} />
              </label>
            </div>
            <Button size="lg" block className="mt-5" onClick={openImporter} disabled={busy || !isPuzzleDate(date)}>
              {busy ? t("nytImport.working") : t("nytImport.open")}
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted">{t("nytImport.session")}</p>
          </> : <>
            <p className="mt-5 text-sm text-ink-soft">{t("nytImport.webOnly")}</p>
            <a href="/install-bookmarklet" className={buttonClass("secondary", "md", "mt-4")}>
              {t("nytImport.bookmarklet")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </>}
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        </Card>
        {saved && <Card className="border-brand-200 bg-brand-50/60 p-5 sm:p-6" aria-live="polite">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4.5 text-brand-600" aria-hidden="true" />
            <Eyebrow className="text-brand-700">{t("nytImport.saved")}</Eyebrow>
          </div>
          <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-ink">{saved.title}</h2>
          <p className="mt-1 text-sm text-muted tabular-nums">{saved.author} · {saved.width}×{saved.height}</p>
          <p className="mt-3 text-sm text-ink-soft">{t("nytImport.local")}</p>
          <Button size="lg" block className="mt-4" onClick={() => {
            game.setUrlPuzzle(saved); navigate("/puzzle-ready");
          }}>{t("nytImport.continue")}</Button>
        </Card>}
      </div>
    </main>
  );
}
