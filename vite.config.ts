import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "mobile" ? [{
    name: "mobile-html",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string) {
        return html.replace(/\s*<!-- Google Analytics 4 -->[\s\S]*?(?=\s*<\/head>)/, "")
          .replace('content="width=device-width, initial-scale=1.0"', 'content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
      },
    },
  }] : [])],
  test: {
    environment: "node",
    setupFiles: ["./src/i18n/i18n.ts"],
    // Playwright specs live in e2e/ and run via `pnpm e2e`, not vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));
