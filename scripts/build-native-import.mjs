import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  entryPoints: [resolve(root, 'src/native/nyt-extractor.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'NytExtraction',
  target: 'es2020', minify: true,
});
mkdirSync(resolve(root, 'public/native'), { recursive: true });
writeFileSync(resolve(root, 'public/native/nyt-import.js'),
  `(function(){${result.outputFiles[0].text};return NytExtraction.extract;})()`);
console.log('Built native NYT extractor (no remote scripts).');
