import { useState } from "react";
import { useTranslation } from "react-i18next";
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

  const boxClass = `mb-4 rounded-xl px-4 py-3 border ${
    darkMode
      ? "bg-indigo-500/10 border-indigo-500/40"
      : "bg-indigo-50 border-indigo-200"
  }`;

  if (signedAs) {
    return (
      <div className={boxClass}>
        <p
          className={`text-center text-sm font-semibold ${
            darkMode ? "text-indigo-300" : "text-indigo-700"
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
          darkMode ? "text-indigo-300" : "text-indigo-700"
        }`}
      >
        🏅 {t("leaderboard.signPrompt", { name: t("common.defaultPlayerName") })}
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
          className={`min-w-0 flex-1 px-3 py-2 rounded-lg border text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            darkMode
              ? "bg-neutral-700 border-neutral-600 text-white placeholder:text-neutral-400"
              : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
          }`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className={`shrink-0 px-4 py-2 rounded-lg font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${
            darkMode
              ? "bg-indigo-600 hover:bg-indigo-500"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {t("leaderboard.signSave")}
        </button>
      </div>
    </div>
  );
}
