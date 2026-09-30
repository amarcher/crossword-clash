import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Loader2, Tv } from "lucide-react";
import { loadPlayerName } from "../../lib/playerName";
import { LegalLinks } from "../LegalLinks";
import { FlowPage, TextField } from "../Flow";
import { Button, buttonClass } from "../ui";

interface JoinGameProps {
  onJoin: (code: string, displayName: string) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
  initialCode?: string;
  /** True while a tapped join is waiting for the anonymous session to finish loading. */
  connecting?: boolean;
}

const CODE_LENGTH = 6;

/** Normalizes typed/pasted input to a game code. Accepts a pasted invite URL (`?join=ABC123`). */
function sanitizeCode(raw: string): string {
  const fromUrl = raw.match(/[?&]join=([A-Za-z0-9]{6})/);
  const source = fromUrl ? fromUrl[1] : raw;
  return source.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export function JoinGame({ onJoin, onBack, loading, error, initialCode, connecting }: JoinGameProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState(() => sanitizeCode(initialCode ?? ""));
  // Prefill with the persisted name so returning players just hit Join.
  const [displayName, setDisplayName] = useState(() => loadPlayerName() ?? "");
  const [codeFocused, setCodeFocused] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (code.length === CODE_LENGTH && displayName.trim()) {
      onJoin(code.toUpperCase(), displayName.trim());
    }
  };

  const handleCodeChange = (raw: string) => {
    const next = sanitizeCode(raw);
    setCode(next);
    // A finished code with no name yet: hand the keyboard to the name field.
    if (next.length === CODE_LENGTH && !displayName.trim()) nameRef.current?.focus();
  };

  return (
    <FlowPage title={t("join.title")} subtitle={t("join.subtitle")} onBack={onBack} backLabel={t("join.back")}>
      <form onSubmit={handleSubmit} className="grid gap-5" autoComplete="off">
        <div>
          <label htmlFor="join-game-code" className="mb-1.5 block text-sm font-semibold text-ink-soft">
            {t("join.gameCode")}
          </label>
          {/* Six crossword cells drawn over one real input: paste, autofill and
              the OS keyboard all keep working; the cells are display only. */}
          <div className="relative">
            <div aria-hidden="true" className="flex justify-between gap-2">
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const active = codeFocused && i === Math.min(code.length, CODE_LENGTH - 1);
                return (
                  <span
                    key={i}
                    className={`grid aspect-[4/5] min-w-0 flex-1 place-items-center rounded-xl border bg-surface font-mono text-3xl font-bold text-ink shadow-card transition-[border-color,box-shadow] ${
                      active ? "border-brand-500 ring-4 ring-brand-500/20" : "border-line-strong"
                    }`}
                  >
                    {code[i] ?? ""}
                  </span>
                );
              })}
            </div>
            <input
              id="join-game-code"
              type="text"
              name="xw-code"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              maxLength={200}
              inputMode="text"
              enterKeyHint="next"
              autoComplete="nofill"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore
              className="absolute inset-0 size-full cursor-text rounded-xl bg-transparent text-base text-transparent caret-transparent opacity-0 focus-visible:outline-none"
            />
          </div>
        </div>

        <TextField
          ref={nameRef}
          id="join-display-name"
          label={t("join.yourName")}
          type="text"
          name="xw-handle"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("join.namePlaceholder")}
          maxLength={20}
          enterKeyHint="go"
          autoCapitalize="words"
          autoCorrect="off"
          autoComplete="nofill"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore
        />

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          block
          disabled={code.length !== CODE_LENGTH || !displayName.trim() || loading}
          aria-busy={loading || undefined}
        >
          {loading && <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {connecting ? t("join.connecting") : loading ? t("join.joining") : t("join.joinGame")}
        </Button>
      </form>

      <div className="mt-6 border-t border-line pt-4">
        <Link
          to={code.length === CODE_LENGTH ? `/watch/${code}` : "/watch"}
          className={buttonClass("ghost", "md", "w-full")}
        >
          <Tv className="size-4.5" aria-hidden="true" />
          {t("spectator.join")}
        </Link>
      </div>
      <LegalLinks className="mt-2" />
    </FlowPage>
  );
}
