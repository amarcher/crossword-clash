import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { useAccountContext } from "../../contexts/AccountContext";
import { plusEnabled } from "../../lib/plus";
import { ListGroup, ListRow } from "../ui";
import { PlusSeal } from "../ui/PlusBadge";

/** The gold Plus seal where a row takes an icon. */
const MenuSeal = () => <PlusSeal size="1.5rem" />;

/**
 * The menu's account rows. Anonymous visitors get the benefit-led sign-in
 * pitch ("Save your solve history", opening the sign-in sheet); a signed-in
 * solver has the header avatar (AccountControl) for that instead. With Plus
 * live, everyone gets a "Crossword Clash Plus" row: the pitch for a
 * non-subscriber (the paywall asks an anonymous visitor to sign in first) and
 * "tap to manage" for a subscriber, so Manage subscription and Restore
 * purchases are always one tap from the menu, not only behind the avatar's
 * menu. Renders nothing where accounts aren't on offer, so offline builds
 * show no new row at all. `children` are rows that share the group — the
 * menu's app-store and studio rows sit between the sign-in row and the Plus
 * row, so the section is one card whatever the account state.
 */
export function AccountMenuRow({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const account = useAccountContext();
  const ownRows = account.available && account.ready;
  const showSignIn = ownRows && !account.user;
  const showPlus = ownRows && plusEnabled() && account.plusReady;
  if (!showSignIn && !showPlus && !children) return null;

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
      {children}
      {showPlus && (
        <ListRow
          icon={MenuSeal}
          tone="gold"
          title={t("plus.title")}
          subtitle={t(account.plus ? "plus.rowActive" : "plus.rowPitch")}
          onClick={() => account.openPaywall({ placement: "menu" })}
        />
      )}
    </ListGroup>
  );
}
