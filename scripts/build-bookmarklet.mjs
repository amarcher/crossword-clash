#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const APP_URL = 'https://crosswordclash.com/';

const source = readFileSync(resolve(root, 'bookmarklet/nyt.js'), 'utf8').replace(
  /var APP_URL = "[^"]*";/,
  `var APP_URL = ${JSON.stringify(APP_URL)};`,
);

const { code } = await esbuild.transform(source, {
  minify: true,
  target: 'es2017',
  loader: 'js',
});

const bookmarklet = 'javascript:void%20' + encodeURI(code.trim());
const href = bookmarklet.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const template = readFileSync(resolve(root, 'bookmarklet/install-page.html'), 'utf8');
const html = template.replace(/\{\{BOOKMARKLET_HREF\}\}/g, href);

const outDir = resolve(root, 'public/install-bookmarklet');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'index.html'), html);

console.log(
  `[build-bookmarklet] wrote public/install-bookmarklet/index.html (${bookmarklet.length} chars)`,
);
