import { useEffect, useState } from "react";
import { loadProgressStore, subscribeProgressChanges, type SoloProgressStore } from "../lib/soloProgress";

export function useSoloProgress(): SoloProgressStore {
  const [store, setStore] = useState<SoloProgressStore>({});
  useEffect(() => {
    const refresh = () => setStore(loadProgressStore());
    refresh();
    const unsubscribe = subscribeProgressChanges(refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("solo-progress-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => { unsubscribe(); window.removeEventListener("solo-progress-updated", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  return store;
}
