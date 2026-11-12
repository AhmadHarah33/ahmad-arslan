import { useId } from "react";

// The Mars Technical mark ("Tilted Twins"): a planet with two tilted rings and
// two moons — a pale Deimos on the outer ring, a small Phobos on the inner ring.
// Geometry is the brand board's. Every size the UI uses keeps both rings and both
// moons; only the tiniest sizes (under 20px, not used in the app) fall back to
// the board's one-ring version.
//
// Colour: "Copper" — a metallic orange-brown gradient across planet and rings,
// pale-sand moons. On a light tile the mark is the copper gradient; on the dark
// tile it is a lighter copper on a deep brown tile.

export const COPPER = ["#F4B06A", "#B8651F", "#6E3410"];
export const COPPER_LIGHT = ["#F8C58C", "#D98338"];
export const MOON = "#FBE3C2";
const DARK_TILE = ["#1F1610", "#43291A"];

type Tier = {
  o: [rx: number, ry: number, stroke: number];
  i: [rx: number, ry: number, stroke: number] | null;
  pk: number; // planet knock-out radius
  pb: number; // planet body radius
  m1: [x: number, y: number, knock: number, body: number];
  m2: [x: number, y: number, knock: number, body: number] | null;
  scale: number; // inside the app tile
};

export const TIERS: Record<"xl" | "lg" | "md" | "sm" | "xs", Tier> = {
  xl: { o: [43, 13.5, 2.5], i: [29, 9, 3], pk: 19, pb: 15, m1: [76, 41.27, 9.5, 6.2], m2: [11.43, 62.89, 6.5, 3.8], scale: 1 },
  lg: { o: [43, 13.5, 3], i: [29, 9, 3.5], pk: 19, pb: 15, m1: [76, 41.27, 10, 6.8], m2: [11.43, 62.89, 7, 4.2], scale: 0.82 },
  md: { o: [43, 13.5, 4.5], i: [29, 9, 5], pk: 20, pb: 15, m1: [76, 41.27, 11, 8], m2: [11.43, 62.89, 8, 5], scale: 0.82 },
  sm: { o: [40, 13, 6.5], i: null, pk: 21, pb: 16, m1: [83, 36, 13, 9.5], m2: null, scale: 0.84 },
  xs: { o: [40, 13, 9], i: null, pk: 22, pb: 17, m1: [83, 36, 15, 11], m2: null, scale: 0.86 },
};

export function tierFor(size: number): keyof typeof TIERS {
  // lg (thinner strokes) from 40px up: at the heavier md weight the rings merge
  // into the planet at tile sizes and the orbits look blobby.
  return size >= 120 ? "xl" : size >= 40 ? "lg" : size >= 20 ? "md" : size >= 16 ? "sm" : "xs";
}

function Gradient({ id, stops }: { id: string; stops: string[] }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="14" y1="12" x2="86" y2="88">
      {stops.map((c, i) => (
        <stop key={c + i} offset={i / (stops.length - 1)} stopColor={c} />
      ))}
    </linearGradient>
  );
}

// tone "light": copper on a light surface (white knock-outs, moon outlined).
// tone "dark": light copper on the deep-brown tile (tile-coloured knock-outs).
function Twins({ tier, tone, ink }: { tier: Tier; tone: "light" | "dark"; ink: string }) {
  const dark = tone === "dark";
  const line = `url(#${ink})`;
  const knock = dark ? DARK_TILE[0] : "#FFFFFF";
  const arc = (rx: number, ry: number, w: number) => (
    <path d={`M${50 - rx} 50 A${rx} ${ry} 0 0 0 ${50 + rx} 50`} fill="none" stroke={line} strokeWidth={w} />
  );
  return (
    <>
      <ellipse cx="50" cy="50" rx={tier.o[0]} ry={tier.o[1]} transform="rotate(-25 50 50)" fill="none" stroke={line} strokeWidth={tier.o[2]} />
      {tier.i && (
        <ellipse cx="50" cy="50" rx={tier.i[0]} ry={tier.i[1]} transform="rotate(-25 50 50)" fill="none" stroke={line} strokeWidth={tier.i[2]} />
      )}
      <circle cx="50" cy="50" r={tier.pk} fill={knock} />
      <circle cx="50" cy="50" r={tier.pb} fill={line} />
      <g transform="rotate(-25 50 50)">
        {arc(tier.o[0], tier.o[1], tier.o[2])}
        {tier.i && arc(tier.i[0], tier.i[1], tier.i[2])}
      </g>
      <circle cx={tier.m1[0]} cy={tier.m1[1]} r={tier.m1[2]} fill={knock} />
      <circle
        cx={tier.m1[0]}
        cy={tier.m1[1]}
        r={tier.m1[3]}
        fill={MOON}
        stroke={dark ? undefined : COPPER[2]}
        strokeWidth={dark ? undefined : 1.6}
      />
      {tier.m2 && (
        <>
          <circle cx={tier.m2[0]} cy={tier.m2[1]} r={tier.m2[2]} fill={knock} />
          <circle cx={tier.m2[0]} cy={tier.m2[1]} r={tier.m2[3]} fill={line} />
        </>
      )}
    </>
  );
}

// Bare mark for light surfaces (print pages, anywhere on white).
export function MarsMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <defs>
        <Gradient id={`${id}l`} stops={COPPER} />
      </defs>
      <Twins tier={TIERS[tierFor(size)]} tone="light" ink={`${id}l`} />
    </svg>
  );
}

// App tile. Light theme: the copper mark on a white tile. Dark theme: light
// copper on a deep-brown tile. Both are rendered and CSS shows the one for the
// current theme (.mars-tile-* in globals.css), so there is no flash while the
// theme applies.
export function MarsTile({ size = 34, className }: { size?: number; className?: string }) {
  const id = useId();
  const t = TIERS[tierFor(size)];
  const inner = `translate(50 50) scale(${t.scale}) translate(-50 -50)`;
  return (
    <>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={`mars-tile-light shrink-0 ${className ?? ""}`}>
        <defs>
          <Gradient id={`${id}l`} stops={COPPER} />
        </defs>
        <rect x="0.75" y="0.75" width="98.5" height="98.5" rx="23" fill="#FFFFFF" stroke="#E6E3E1" strokeWidth="1.5" />
        <g transform={inner}>
          <Twins tier={t} tone="light" ink={`${id}l`} />
        </g>
      </svg>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={`mars-tile-dark shrink-0 ${className ?? ""}`}>
        <defs>
          <Gradient id={`${id}d`} stops={COPPER_LIGHT} />
          <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={DARK_TILE[0]} />
            <stop offset="1" stopColor={DARK_TILE[1]} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="23" fill={`url(#${id}t)`} />
        <g transform={inner}>
          <Twins tier={t} tone="dark" ink={`${id}d`} />
        </g>
      </svg>
    </>
  );
}

// "MARS" over "TECHNICAL", as on the brand board. The copper gradient comes from
// --m-grad in globals.css, which switches with the theme.
export function MarsWordmark({ size = 17, className }: { size?: number; className?: string }) {
  const gradient = {
    background: "var(--m-grad)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  } as const;
  return (
    <span className={`flex flex-col ${className ?? ""}`} style={{ lineHeight: 1 }} aria-label="Mars Technical">
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-slab), serif",
          fontWeight: 700,
          fontSize: size,
          letterSpacing: "0.1em",
          lineHeight: 0.95,
          ...gradient,
        }}
      >
        MARS
      </span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-manrope), sans-serif",
          fontWeight: 800,
          fontSize: Math.round(size * 0.5 * 10) / 10,
          letterSpacing: "0.44em",
          marginTop: Math.max(2, Math.round(size * 0.1)),
          ...gradient,
        }}
      >
        TECHNICAL
      </span>
    </span>
  );
}
