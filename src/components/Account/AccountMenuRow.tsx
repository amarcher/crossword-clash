import { useTranslation } from "react-i18next";
import { Sparkles, UserRound } from "lucide-react";
import { useAccountContext } from "../../contexts/AccountContext";
import { plusEnabled } from "../../lib/plus";
import { ListGroup, ListRow } from "../ui";

/**
 * The menu's account rows. Anonymous visitors get the benefit-led sign-in
 * pitch ("Save your solve history", opening the sign-in sheet); a signed-in
 * solver has the header avatar (AccountControl) for that instead. With Plus
 * live, everyone gets a "Crossword Clash Plus" row: the pitch for a
 * non-subscriber (the paywall asks an anonymous visitor to sign in first) and
 * "tap to manage" for a subscriber, so Manage subscription and Restore
 * purchases are always one tap from the menu, not only behind the avatar's
 * menu. Renders nothing where accounts aren't on offer, so offline builds
 * show no new row at all.
 */
export function AccountMenuRow() {
  const { t } = useTranslation();
  const account = useAccountContext();
  if (!account.available || !account.ready) return null;
  const showSignIn = !account.user;
  const showPlus = plusEnabled() && account.plusReady;
  if (!showSignIn && !showPlus) return null;

  return (
    <ListGroup>
      {showSignIn && (
        <ListRow
          icon={UserRound}
          tone="neutral"
          title={t("account.menuRow")}
          subtitle={t("account.menuRowSubtitle")}
          onClick={() => account.openAccount({ placement: "menu" })}
        />
      )}
      {showPlus && (
        <ListRow
          icon={Sparkles}
          tone={account.plus ? "brand" : "gold"}
          title={t("plus.title")}
          subtitle={t(account.plus ? "plus.rowActive" : "plus.rowPitch")}
          onClick={() => account.openPaywall({ placement: "menu" })}
        />
      )}
    </ListGroup>
  );
}
