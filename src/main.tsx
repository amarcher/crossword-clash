import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

const HostApp = lazy(() => import("./HostApp.tsx"));

const isHost = window.location.pathname === "/host";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isHost ? (
      <Suspense fallback={<div className="flex items-center justify-center h-dvh bg-neutral-900 text-white">Loading...</div>}>
        <HostApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
