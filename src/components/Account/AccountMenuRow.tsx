import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { useAccountContext } from "../../contexts/AccountContext";
import { ListGroup, ListRow } from "../ui";

/**
 * The menu's benefit-led pitch for anonymous visitors ("Save your solve
 * history"), opening the sign-in sheet. A signed-in solver has the header
 * avatar (AccountControl) instead, so the row goes away. Renders nothing
 * where accounts aren't on offer, so the apps and offline builds show no
 * new row at all.
 */
export function AccountMenuRow() {
  const { t } = useTranslation();
  const account = useAccountContext();
  if (!account.available || !account.ready || account.user) return null;

  return (
    <ListGroup>
      <ListRow
        icon={UserRound}
        tone="neutral"
        title={t("account.menuRow")}
        subtitle={t("account.menuRowSubtitle")}
        onClick={() => account.openAccount({ placement: "menu" })}
      />
    </ListGroup>
  );
}
