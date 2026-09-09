// Lets `node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs`
// run build scripts that import the app's TypeScript sources directly.
// Vite resolves extensionless relative imports ("./gridUtils"); Node's ESM
// loader does not, so this hook tries `.ts` / `.tsx` / `/index.ts` on miss.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw err;
      const base = context.parentURL ? new URL(specifier, context.parentURL) : null;
      if (!base) throw err;
      const path = fileURLToPath(base);
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(path + suffix)) {
          return nextResolve(pathToFileURL(path + suffix).href, context);
        }
      }
      throw err;
    }
  },
});
