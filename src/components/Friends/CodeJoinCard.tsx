import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { Button, Card, Eyebrow } from "../ui";
import { prefetchOnIntent } from "../../routeModules";

const CODE_LENGTH = 6;

/** Typed or pasted input → a room code; a pasted invite URL (`?join=ABC123`) works too. */
export function sanitizeCode(raw: string): string {
  const fromUrl = raw.match(/[?&]join=([A-Za-z0-9]{6})/);
  const source = fromUrl ? fromUrl[1] : raw;
  return source.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

/**
 * The Race friends screen's "Join with a code" block (spec §3.6): six cells
 * over one real input and a Join button that hands the code to /join, where
 * the name field and the join itself live. Always on the screen, never behind
 * a link: the code is the one path that works for everyone.
 */
export function CodeJoinCard({ first, onJoin }: { first: boolean; onJoin?: (code: string) => void }) {
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const ready = code.length === CODE_LENGTH;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onJoin?.(code);
    navigate(`/join?join=${code}`);
  };

  return (
    <Card className="p-5">
      <Eyebrow as="h2">{t("race.codeHeading")}</Eyebrow>
      {first && <p className="mt-1 text-sm text-muted">{t("race.codeIntro")}</p>}
      <form onSubmit={submit} className="mt-3 grid gap-3" autoComplete="off">
        <div className="relative">
          <div aria-hidden="true" className="flex justify-between gap-2">
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const active = focused && i === Math.min(code.length, CODE_LENGTH - 1);
              return (
                <span
                  key={i}
                  className={`grid aspect-[4/5] min-w-0 max-w-14 flex-1 place-items-center rounded-xl border bg-surface font-mono text-2xl font-bold text-ink shadow-card transition-[border-color,box-shadow] ${
                    active ? "border-brand-500 ring-4 ring-brand-500/20" : "border-line-strong"
                  }`}
                >
                  {code[i] ?? ""}
                </span>
              );
            })}
          </div>
          <input
            id="race-join-code"
            type="text"
            name="xw-code"
            aria-label={t("join.gameCode")}
            value={code}
            onChange={(e) => setCode(sanitizeCode(e.target.value))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={200}
            inputMode="text"
            enterKeyHint="go"
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
        <Button type="submit" size="lg" block disabled={!ready} {...prefetchOnIntent("/join")}>
          {t("race.join")}
        </Button>
        <p className="text-center text-sm text-muted">{t("race.scanHint")}</p>
      </form>
    </Card>
  );
}
