import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { buttonClass } from "./ui";
import { MAX_PLAYER_NAME_LENGTH } from "../lib/playerName";

interface BoardSignFormProps {
  /** The name the entry is currently under (the anonymous default, usually). */
  currentName: string;
  /** Once signed, the confirmed name — flips the form into a confirmation. */
  signedAs?: string | null;
  /**
   * The time is parked on this device and goes on the board only once
   * signed (the rule for the anonymous default), so the prompt asks for a
   * name to post rather than to claim a row that is already public.
   */
  unposted?: boolean;
  onSign: (name: string) => void;
  darkMode?: boolean;
  className?: string;
}

/**
 * "Sign the board" — the arcade high-score moment, in one place for the
 * completion modal and the leaderboard itself (navigation audit §3, item 11).
 * A finish under the default name waits here, on this device, until it is
 * signed (`unposted`); a row that is already public under the default (an
 * older client's) is renamed. Either way the copy, the input rules and the
 * confirmation stay in step wherever the prompt appears.
 */
export function BoardSignForm({ currentName, signedAs, unposted, onSign, darkMode, className = "" }: BoardSignFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  const box = `rounded-2xl px-4 py-3 ${
    darkMode ? "bg-white/5 ring-1 ring-stage-line" : "bg-gold-50/60 ring-1 ring-gold-100"
  } ${className}`;
  const prompt = `flex items-center justify-center gap-2 text-center text-sm font-semibold ${
    darkMode ? "text-white/80" : "text-gold-700"
  }`;

  if (signedAs) {
    return (
      <div className={box} data-testid="board-sign">
        <p className={prompt}>
          <Trophy className="size-4 shrink-0" aria-hidden="true" />
          {t("leaderboard.signedAs", { name: signedAs })}
        </p>
      </div>
    );
  }

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onSign(trimmed);
  };

  return (
    <div className={box} data-testid="board-sign">
      <p className={`${prompt} mb-2.5`}>
        <Trophy className="size-4 shrink-0" aria-hidden="true" />
        {unposted ? t("leaderboard.signToPost") : t("leaderboard.signPrompt", { name: currentName })}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("leaderboard.signPlaceholder")}
          aria-label={t("leaderboard.signPlaceholder")}
          maxLength={MAX_PLAYER_NAME_LENGTH}
          autoComplete="nickname"
          className={`min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-center text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 md:text-sm ${
            darkMode
              ? "border-stage-line bg-white/5 text-white placeholder:text-white/40"
              : "border-line-strong bg-surface text-ink placeholder:text-subtle"
          }`}
        />
        <button type="button" onClick={submit} disabled={!name.trim()} className={buttonClass("primary", "md", "shrink-0")}>
          {unposted ? t("leaderboard.signPost") : t("leaderboard.signSave")}
        </button>
      </div>
    </div>
  );
}
