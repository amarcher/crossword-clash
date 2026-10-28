import { useTranslation } from "react-i18next";
import { Sparkles, UserRound } from "lucide-react";
import { useAccountContext } from "../../contexts/AccountContext";
import { plusEnabled } from "../../lib/plus";
import { ListGroup, ListRow } from "../ui";

/**
 * The menu's rows for anonymous visitors: the benefit-led sign-in pitch
 * ("Save your solve history", opening the sign-in sheet) and, with Plus
 * live, a "Crossword Clash Plus" row opening the paywall, which is how a
 * visitor who has not signed in reaches the subscription at all (the apps
 * sell to anonymous users; the web paywall asks them to sign in first). A
 * signed-in solver has the header avatar (AccountControl, with "About Plus")
 * instead, so both rows go away. Renders nothing where accounts aren't on
 * offer, so offline builds show no new row at all.
 */
export function AccountMenuRow() {
  const { t } = useTranslation();
  const account = useAccountContext();
  if (!account.available || !account.ready || account.user) return null;
  const showPlus = plusEnabled() && account.plusReady && !account.plus;

  return (
    <ListGroup>
      <ListRow
        icon={UserRound}
        tone="neutral"
        title={t("account.menuRow")}
        subtitle={t("account.menuRowSubtitle")}
        onClick={() => account.openAccount({ placement: "menu" })}
      />
      {showPlus && (
        <ListRow
          icon={Sparkles}
          tone="gold"
          title={t("plus.title")}
          subtitle={t("plus.rowPitch")}
          onClick={() => account.openPaywall({ placement: "menu" })}
        />
      )}
    </ListGroup>
  );
}
