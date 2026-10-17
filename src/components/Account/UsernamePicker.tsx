import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { isUsernameTaken, saveUsername, type Profile } from "../../lib/account";
import { savePlayerName } from "../../lib/playerName";
import { normalizeUsername, suggestUsername, USERNAME_MAX, validateUsername, type UsernameProblem } from "../../lib/username";
import { TextField } from "../Flow";
import { Button } from "../ui";

interface UsernamePickerProps {
  userId: string;
  /** The username on record, when changing one. */
  current: string | null;
  /** The provider's display name, the starting point for a first pick. */
  suggestFrom: string;
  onSaved: (profile: Profile) => void;
  onCancel: () => void;
  cancelLabel: string;
}

type Availability = "idle" | "checking" | "available" | "taken" | "unknown";

const CHECK_DELAY_MS = 400;

/**
 * Pick (or change) the public username, with the rules checked on every
 * keystroke and availability checked once typing pauses. Saving also makes it
 * the name the host/join prompts prefill with.
 */
export function UsernamePicker({ userId, current, suggestFrom, onSaved, onCancel, cancelLabel }: UsernamePickerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => current ?? suggestUsername(suggestFrom));
  const [availability, setAvailability] = useState<Availability>("idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hintId = useId();

  const problem: UsernameProblem | null = validateUsername(value);
  const unchanged = current !== null && value.toLowerCase() === current.toLowerCase();

  useEffect(() => {
    if (problem || unchanged) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    let live = true;
    const id = window.setTimeout(() => {
      isUsernameTaken(value, userId)
        .then((taken) => live && setAvailability(taken ? "taken" : "available"))
        .catch(() => live && setAvailability("unknown"));
    }, CHECK_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [value, problem, unchanged, userId]);

  const canSave = !problem && !saving && availability !== "taken" && availability !== "checking" && !unchanged;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveUsername(userId, value);
    setSaving(false);
    if (result.ok) {
      savePlayerName(result.profile.username);
      onSaved(result.profile);
      return;
    }
    if (result.reason === "taken") setAvailability("taken");
    else if (result.reason === "invalid") setSaveError(t("account.invalidChars"));
    else setSaveError(t("account.genericError"));
  };

  // One line of feedback under the field: the rule broken, else availability.
  let hint: { text: string; tone: "muted" | "good" | "bad" } | null = null;
  if (value.length > 0 && problem) hint = { text: t(`account.${problem}`), tone: "bad" };
  else if (availability === "checking") hint = { text: t("account.checking"), tone: "muted" };
  else if (availability === "taken") hint = { text: t("account.taken"), tone: "bad" };
  else if (availability === "available") hint = { text: t("account.available"), tone: "good" };
  const toneClass = hint?.tone === "bad" ? "text-red-700" : hint?.tone === "good" ? "text-emerald-700" : "text-muted";

  return (
    <form onSubmit={submit} className="grid gap-4" autoComplete="off">
      <div>
        <TextField
          id="username-picker"
          label={t("account.usernameLabel")}
          type="text"
          name="xw-username"
          value={value}
          onChange={(e) => setValue(normalizeUsername(e.target.value))}
          maxLength={USERNAME_MAX + 1}
          enterKeyHint="done"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="nofill"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore
          aria-describedby={hintId}
          aria-invalid={hint?.tone === "bad" || undefined}
        />
        <p id={hintId} aria-live="polite" className={`mt-1.5 flex min-h-5 items-center gap-1.5 text-sm font-medium ${toneClass}`}>
          {availability === "checking" && !problem && <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {hint?.tone === "good" && <Check className="size-3.5" aria-hidden="true" />}
          {hint?.text}
        </p>
      </div>
      {saveError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {saveError}
        </p>
      )}
      <div className="flex gap-2.5">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" size="lg" className="flex-1" disabled={!canSave} aria-busy={saving || undefined}>
          {saving && <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {saving ? t("account.saving") : t("account.saveUsername")}
        </Button>
      </div>
    </form>
  );
}
