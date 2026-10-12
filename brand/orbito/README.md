# Orbito — archived brand

The first rebrand of the app ("Midnight O" mark, ink accent, draw splash). It was
live from 2026-10-11 until the Mars Technical logo replaced it.

**Exact restore point:** `git checkout orbito-brand` (tag on commit `8e3f493`, the
deployed Orbito version). Everything below is a convenience copy.

| File | What it is |
|---|---|
| `orbito-mark.tsx.txt` | `OrbitoMark` / `OrbitoTile` React components (theme-aware via `--o-*` vars) |
| `splash.tsx.txt` | Cold-start splash (draw / orbit / breathe motions, ~2.5s, light look) |
| `orbito-theme.css.txt` | Ink accent ramp, dark-mode lift, mark colour vars, splash CSS |
| `make-icons.mjs.txt` | Generates the PNG icons + favicon from the mark geometry |
| `icons/` | Rendered icon-192/512, maskable-512, favicon.ico |
| `boards/` | Final brand boards (Midnight O, dark + light) |

Source files are stored with a `.txt` suffix so TypeScript and the build ignore them.
To reuse: drop the `.txt`, put the components in `components/`, the script in
`scripts/`, and paste the CSS back into `app/globals.css`.

Palette: Space Black `#141414`, Graphite `#2A2A2A`, Amber `#FF9F1C` (dark) /
`#E07B00` (light), White, Ash `#A8A8A8`; light Paper `#F4F2EE`, Ink `#1A1A1A`.
Type on the board: Bricolage Grotesque 700 (wordmark), DM Sans (UI) — the app
itself used Poppins.
