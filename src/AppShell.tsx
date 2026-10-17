import { StrictMode, type ReactNode } from "react";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ConsentBanner } from "./components/ConsentBanner";
import { DeferredAnalytics } from "./components/DeferredAnalytics";

/**
 * Everything around the router, shared by the browser entry (main.tsx, with a
 * RouterProvider) and the build-time prerender (entry-server.tsx, with a
 * StaticRouterProvider). The two trees must be identical for hydration to
 * take the server HTML as-is, so neither entry adds anything beside this.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <ConfirmProvider>{children}</ConfirmProvider>
      <DeferredAnalytics />
      <ConsentBanner />
    </StrictMode>
  );
}
