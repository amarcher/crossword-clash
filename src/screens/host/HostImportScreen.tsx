import { PuzzleImporter } from "../../components/PuzzleImporter";
import { useHostContext } from "../../layouts/HostLayout";

export function HostImportScreen() {
  const { handlePuzzleLoaded } = useHostContext();

  return <PuzzleImporter onPuzzleLoaded={handlePuzzleLoaded} />;
}
