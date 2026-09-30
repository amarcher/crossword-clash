import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "ios",
      "artifacts",
      "android",
      // Static/generated assets: install-bookmarklet page, native bundles,
      // classic-puzzle manifest, etc.
      "public",
      "node_modules",
      ".claude",
      ".vercel",
      "coverage",
      "playwright-report",
      "test-results",
      // Deno edge functions — different runtime/globals, not part of the Vite app.
      "supabase/functions",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs,mts}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Only the two classic hook rules. The v7 "recommended" preset also turns on
      // the React Compiler rules, which is a separate (much larger) migration.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // The bookmarklet is deliberately ES5-style (it runs as a javascript: URL on
    // third-party pages) and inlines vendored lz-string, so keep `var` and the
    // library's dead-store initialisers as-is.
    files: ["bookmarklet/**/*.js"],
    languageOptions: { sourceType: "script" },
    rules: {
      "no-var": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    // Node-side code: build scripts, serverless functions, tooling config, E2E.
    files: ["scripts/**", "api/**", "e2e/**", "*.config.{js,ts,mjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
