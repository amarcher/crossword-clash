import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buttonClass } from "../ui";
import { MAX_PLAYER_NAME_LENGTH } from "../../lib/playerName";

interface LeaderboardSignFormProps {
  /** Once signed, the confirmed name — flips the form into a confirmation. */
  signedAs?: string | null;
  onSign: (name: string) => void;
  darkMode?: boolean;
}

/**
 * "Sign the board" prompt on the completion modal — the arcade high-score
 * moment. Shown only when a daily-mini time was just submitted under the
 * anonymous default name: the time is already on the board (submission never
 * waits for a name), this just claims it.
 */
export function LeaderboardSignForm({ signedAs, onSign, darkMode }: LeaderboardSignFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  const boxClass = `mb-5 rounded-2xl px-4 py-3 ${
    darkMode ? "bg-white/5 ring-1 ring-stage-line" : "bg-surface-sunken"
  }`;

  if (signedAs) {
    return (
      <div className={boxClass}>
        <p
          className={`text-center text-sm font-semibold ${
            darkMode ? "text-white/80" : "text-ink-soft"
          }`}
        >
          {t("leaderboard.signedAs", { name: signedAs })}
        </p>
      </div>
    );
  }

  const submit = () => {
    if (name.trim()) onSign(name);
  };

  return (
    <div className={boxClass}>
      <p
        className={`text-center text-sm font-semibold mb-2 ${
          darkMode ? "text-white/80" : "text-ink-soft"
        }`}
      >
        {t("leaderboard.signPrompt", { name: t("common.defaultPlayerName") })}
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
          className={`h-11 min-w-0 flex-1 rounded-xl border px-3 text-center text-base font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${
            darkMode
              ? "bg-white/5 border-stage-line text-white placeholder:text-white/40"
              : "bg-surface border-line-strong text-ink placeholder:text-subtle"
          }`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className={buttonClass("primary", "md", "shrink-0")}
        >
          {t("leaderboard.signSave")}
        </button>
      </div>
    </div>
  );
}
