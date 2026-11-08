/** Native app events complement WebView visibility events; neither owns a clock. */
export function watchSoloLifecycle(onHide: () => void, onBack: () => void): () => void {
  if (import.meta.env.MODE !== "mobile") return () => {};
  let disposed = false;
  const cleanups: Array<() => void> = [];
  void import("@capacitor/app").then(async (m) => {
    const state = await m.App.addListener("appStateChange", ({ isActive }) => { if (!isActive && !disposed) onHide(); });
    if (disposed) void state.remove(); else cleanups.push(() => { void state.remove(); });
    const back = await m.App.addListener("backButton", () => { if (!disposed) onBack(); });
    if (disposed) void back.remove(); else cleanups.push(() => { void back.remove(); });
  }).catch(() => {});
  return () => { disposed = true; for (const cleanup of cleanups) cleanup(); };
}
