# Cold-start splash (draft)

The logo animation that played when the app opened: the Mars mark builds up (planet, rings sweeping round it, two moons settling in), then the wordmark fades in and the screen fades into the app. Removed from the app on 2026-11-12; kept here to bring back later.

To restore:
1. Copy `splash.tsx.txt` to `components/splash.tsx`.
2. Append `splash.css.txt` to `app/globals.css`.
3. In `app/layout.tsx` add `import { Splash } from "@/components/splash";` and render `<Splash />` as the first child of `<body>`, after the theme script.

Note: it was drawn in the old indigo colours (screen `#323490`, reversed mark). Recolour it to Copper before reviving it. `?splash=1` replays it for design review.
