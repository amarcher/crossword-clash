/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "mobile" ? [{
    name: "mobile-html",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string) {
        return html.replace(/\s*<!-- Google Analytics 4 -->[\s\S]*?(?=\s*<\/head>)/, "");
      },
    },
  }] : [])],
  test: {
    environment: "node",
    setupFiles: ["./src/i18n/i18n.ts"],
  },
}));
