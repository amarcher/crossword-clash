<!-- What changed and why, written to be read: the commit log is the history. -->

## Calls made

<!-- Judgment calls shipped for veto. "None" is a fine answer. -->

## Verified

<!-- Each line names what actually ran, or says plainly that it did not.
     A PR without this section does not merge on its own (clash-agent/prwatch.py). -->

- Gate: `pnpm lint && pnpm build && pnpm exec vitest run src api proxy.test.ts` (what CI runs) —
- Preview (the Vercel preview this PR gets — opened and looked at, at a phone width too, or not) —
- Simulator / device (Capacitor, iOS, Android work: which one ran it, or none available) —
- Supabase (a migration applied, a function deployed, a trigger installed — or none touched) —
- Store (App Store Connect / TestFlight / Play state checked, and what was not touched) —
