import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Play, Trash2 } from "lucide-react";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useSoloProgress } from "../hooks/useSoloProgress";
import { clearProgress, type SoloProgressRecord } from "../lib/soloProgress";
import { formatDuration, puzzleIdentity } from "../lib/soloStats";
import { loadPublishedIndex, type DailyIndexEntry } from "../lib/dailyIndex";
import { fetchDailyForDay } from "../lib/dailyFeed";
import { todayKey } from "../lib/dailyLeaderboard";
import { Card, Button, Eyebrow } from "./ui";

export function SoloContinue() {
  const { t } = useTranslation();
  const game = useGame();
  const navigate = useNavigate();
  const store = useSoloProgress();
  const records = Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState(false);
  const [legacyIndex, setLegacyIndex] = useState<DailyIndexEntry[]>([]);
  const [loadError, setLoadError] = useState(false);
  const hasLegacy = records.some(record => !record.puzzle);
  useEffect(() => {
    if (!hasLegacy) return;
    let live = true;
    void loadPublishedIndex(todayKey()).then(entries => { if (live) setLegacyIndex(entries ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [hasLegacy]);
  if (!records.length && !game.soloSaveError) return null;
  const resume = async (record: SoloProgressRecord) => {
    setLoadError(false);
    try {
      const entry = legacyIndex.find(entry => entry.identity === record.key);
      const daily = !record.puzzle && entry ? await fetchDailyForDay(entry.day, entry.slot) : null;
      const puzzle = record.puzzle ?? daily?.puzzle;
      if (!puzzle) { navigate("/archive"); return; }
      if (puzzleIdentity(puzzle) !== record.key) { setLoadError(true); return; }
      if (await game.handleSoloPuzzleLoaded(puzzle) === false) return;
      if (daily) game.setSoloTheme(daily.theme);
      navigate("/solo/play");
    } catch { setLoadError(true); }
  };
  const remove = (key: string) => {
    // Clear the compatibility pointer before deleting an active record, so a
    // reload cannot bring a removed puzzle back. Never reset a multiplayer room.
    const current = !game.isMultiplayer && game.puzzle && puzzleIdentity(game.puzzle) === key;
    try {
      const pointer = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (pointer?.puzzle && puzzleIdentity(pointer.puzzle) === key) localStorage.removeItem(STORAGE_KEY);
    } catch { setRemoveError(true); return; }
    if (!clearProgress(key)) { setRemoveError(true); return; }
    if (current) game.reset();
    setRemoving(null);
    setRemoveError(false);
  };
  return (
    <Card role="region" className="mx-auto mb-6 w-full max-w-md p-4 lg:max-w-5xl" aria-label={t("soloPause.continue")}>
      <Eyebrow>{t("soloPause.continue")}</Eyebrow>
      {loadError && <p role="alert" className="mt-3 text-sm text-ink-soft">{t("soloPause.loadError")}</p>}
      {game.soloSaveError && <p role="alert" className="my-3 text-sm text-ink-soft">{t(game.soloSaveError === "capacity" ? "soloPause.capacity" : "soloPause.saveError")}</p>}
      {(expanded || game.soloSaveError === "capacity" ? records : records.slice(0, 1)).map(record => (
        <div key={record.key} className="mt-3 border-t border-line pt-3 first:border-0">
          <p className="mb-2 break-words font-semibold text-ink">{record.puzzle?.title ?? legacyIndex.find(entry => entry.identity === record.key)?.title ?? t("soloPause.legacy")}</p>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">{t("soloPause.progress", { filled: record.filled, total: record.total, time: formatDuration(record.elapsedMs / 1000) })}</p>
            </div>
            <Button variant="secondary" onClick={() => void resume(record)}>
              <Play className="size-4" aria-hidden="true" />{t((record.puzzle || legacyIndex.some(entry => entry.identity === record.key)) ? "soloPause.resume" : "soloPause.find")}
            </Button>
            {(expanded || game.soloSaveError === "capacity") && <Button variant="ghost" aria-label={t("soloPause.removeNamed", { title: record.puzzle?.title ?? legacyIndex.find(entry => entry.identity === record.key)?.title ?? t("soloPause.legacy") })} onClick={() => setRemoving(record.key)}><Trash2 className="size-4" aria-hidden="true" /></Button>}
          </div>
          {removing === record.key && <div className="mt-3 rounded-xl bg-surface-sunken p-3" role="group" aria-label={t("soloPause.removeTitle")}>
            <p className="font-semibold">{t("soloPause.removeTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("soloPause.removeHint")}</p>
            {removeError && <p role="alert">{t("soloPause.saveError")}</p>}
            <div className="mt-3 flex gap-2"><Button variant="secondary" onClick={() => setRemoving(null)}>{t("soloPause.keep")}</Button><Button variant="danger" onClick={() => remove(record.key)}>{t("soloPause.remove")}</Button></div>
          </div>}
        </div>
      ))}
      {records.length > 0 && <Button className="mt-3" variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{t(expanded ? "soloPause.collapse" : "soloPause.inProgress", { count: records.length })}</Button>}
    </Card>
  );
}
