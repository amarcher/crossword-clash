import { Card } from "../ui";

/**
 * What to tell the constructor when the engine can't load its word list. A
 * local list (dev) is usually just not built yet; a remote one (Supabase
 * Storage, or a VITE_SEEDGRID_WORD_LIST URL) failed to download or isn't
 * uploaded.
 */
export function engineErrorHelp(listUrl: string): { title: string; fix: string; command?: string } {
  if (listUrl.startsWith("/")) {
    return { title: "The studio's word list isn't built.", fix: "Build it, then reload:", command: "pnpm seedgrid:dict && pnpm seedgrid:studio-dict" };
  }
  let host = listUrl;
  try {
    host = new URL(listUrl).host;
  } catch {
    // Not a URL; show it as given.
  }
  return {
    title: "The studio couldn't download its word list.",
    fix: `Check your connection and reload. If it keeps failing, the list may be missing from ${host}; publish it with:`,
    command: "pnpm seedgrid:studio-dict && pnpm seedgrid:upload-dict",
  };
}

export function EngineError({ listUrl, message, className = "" }: { listUrl: string; message: string; className?: string }) {
  const help = engineErrorHelp(listUrl);
  return (
    <Card className={`p-4 ${className}`}>
      <p className="font-semibold text-ink">{help.title}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {help.fix} {help.command && <code className="font-mono break-all">{help.command}</code>}
      </p>
      <p className="mt-1 text-xs text-muted break-all">{message}</p>
    </Card>
  );
}
