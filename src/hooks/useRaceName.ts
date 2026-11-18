import { useTranslation } from "react-i18next";
import { useMaybeAccount } from "../contexts/AccountContext";

/**
 * The viewer's name in a race or a replay: their username (Andrew,
 * 2026-11-17: "You" and its Y read as another player, and a race shared with
 * the people in it should look the same to each of them), or "You" for a
 * viewer without one.
 */
export function useRaceName(): string {
  const { t } = useTranslation();
  return useMaybeAccount()?.profile?.username ?? t("ghostRace.you");
}
