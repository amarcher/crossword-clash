import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { useAccountContext } from "../../contexts/AccountContext";
import { accountName } from "../../lib/account";
import { ListGroup, ListRow } from "../ui";

/**
 * The menu's account entry point. Anonymous visitors see a benefit, not a
 * demand ("Save your solve history"); a signed-in solver sees their username.
 * Renders nothing where accounts aren't on offer, so the apps and offline
 * builds show no new row at all.
 */
export function AccountMenuRow() {
  const { t } = useTranslation();
  const account = useAccountContext();
  if (!account.available || !account.ready) return null;
  const { user, profile } = account;

  return (
    <ListGroup>
      {user ? (
        <ListRow
          icon={UserRound}
          tone="neutral"
          title={profile?.username ?? accountName(user)}
          subtitle={profile ? t("account.accountRowSubtitle") : t("account.noUsernameYet")}
          onClick={() => account.openAccount({ placement: "menu" })}
        />
      ) : (
        <ListRow
          icon={UserRound}
          tone="neutral"
          title={t("account.menuRow")}
          subtitle={t("account.menuRowSubtitle")}
          onClick={() => account.openAccount({ placement: "menu" })}
        />
      )}
    </ListGroup>
  );
}
