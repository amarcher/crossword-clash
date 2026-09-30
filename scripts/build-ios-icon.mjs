import { ImageResponse } from '@vercel/og';
import { createElement as h } from 'react';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Render the existing blue C tile identity at Apple's required 1024px size.
// The opaque background is intentional: App Store icons cannot contain alpha.
const icon = new ImageResponse(
  h('div', { style: { display: 'flex', width: '100%', height: '100%', background: '#0d1225', alignItems: 'center', justifyContent: 'center' } },
    h('div', { style: { display: 'flex', width: 704, height: 704, border: '44px solid #25304b', borderRadius: 144, background: '#ffffff', alignItems: 'center', justifyContent: 'center', color: '#3070ed', fontSize: 600, fontWeight: 700 } }, 'C')),
  { width: 1024, height: 1024 },
);
await writeFile(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url), Buffer.from(await icon.arrayBuffer()));
execFileSync('swift', [fileURLToPath(new URL('./opaque-png.swift', import.meta.url)), fileURLToPath(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url))]);
console.log('Rendered iOS app icon from the existing Crossword Clash identity.');
