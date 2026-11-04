import { useTranslation } from "react-i18next";
import { PuzzleImporter } from "../../components/PuzzleImporter";
import { useHostContext } from "../../layouts/HostLayout";
import { TVPuzzleSources } from "./TVPuzzleSources";

/** The TV's puzzle chooser: today's dailies, the archive and the community first, then a file or an import. */
export function HostImportScreen() {
  const { t } = useTranslation();
  const { handlePuzzleLoaded } = useHostContext();

  return (
    <PuzzleImporter
      onPuzzleLoaded={handlePuzzleLoaded}
      title={t("importer.tvTitle")}
      subtitle={t("importer.tvSubtitle")}
      sources={<TVPuzzleSources onPick={handlePuzzleLoaded} />}
    />
  );
}
