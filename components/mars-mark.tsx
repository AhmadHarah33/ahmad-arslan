// The Mars Technical mark ("Tilted Twins"): a planet with two tilted rings and
// two moons — lime Deimos on the outer ring, a small Phobos on the inner ring.
// Geometry is the brand board's. Every size the UI uses keeps both rings and both
// moons; only the tiniest sizes (under 20px, not used in the app) fall back to
// the board's one-ring version. The PNG icons are rendered from the same shapes
// (see scripts/make-icons.mjs).

export const MARS_INDIGO = "#323490";
export const MARS_LIME = "#BED631";

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

// tone "indigo": indigo on a light surface (white knock-outs, lime moon outlined).
// tone "reversed": white on indigo (indigo knock-outs, plain lime moon).
function Twins({ tier, tone }: { tier: Tier; tone: "indigo" | "reversed" }) {
  const rev = tone === "reversed";
  const line = rev ? "#FFFFFF" : MARS_INDIGO;
  const knock = rev ? MARS_INDIGO : "#FFFFFF";
  const body = rev ? "#FFFFFF" : MARS_INDIGO;
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
      <circle cx="50" cy="50" r={tier.pb} fill={body} />
      <g transform="rotate(-25 50 50)">
        {arc(tier.o[0], tier.o[1], tier.o[2])}
        {tier.i && arc(tier.i[0], tier.i[1], tier.i[2])}
      </g>
      <circle cx={tier.m1[0]} cy={tier.m1[1]} r={tier.m1[2]} fill={knock} />
      <circle
        cx={tier.m1[0]}
        cy={tier.m1[1]}
        r={tier.m1[3]}
        fill={MARS_LIME}
        stroke={rev ? undefined : MARS_INDIGO}
        strokeWidth={rev ? undefined : 1.6}
      />
      {tier.m2 && (
        <>
          <circle cx={tier.m2[0]} cy={tier.m2[1]} r={tier.m2[2]} fill={knock} />
          <circle cx={tier.m2[0]} cy={tier.m2[1]} r={tier.m2[3]} fill={body} />
        </>
      )}
    </>
  );
}

// Bare mark for light surfaces (print pages, anywhere on white).
export function MarsMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <Twins tier={TIERS[tierFor(size)]} tone="indigo" />
    </svg>
  );
}

// App tile. Light theme: the indigo mark on a white tile (the board's "on white"
// version, lime moon outlined). Dark theme: the reversed mark, white planet on
// indigo. Both are rendered and CSS shows the one for the current theme
// (.mars-tile-* in globals.css), so there is no flash while the theme applies.
export function MarsTile({ size = 34, className }: { size?: number; className?: string }) {
  const t = TIERS[tierFor(size)];
  const inner = `translate(50 50) scale(${t.scale}) translate(-50 -50)`;
  return (
    <>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={`mars-tile-light shrink-0 ${className ?? ""}`}>
        <rect x="0.75" y="0.75" width="98.5" height="98.5" rx="23" fill="#FFFFFF" stroke="#E6E6F0" strokeWidth="1.5" />
        <g transform={inner}>
          <Twins tier={t} tone="indigo" />
        </g>
      </svg>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={`mars-tile-dark shrink-0 ${className ?? ""}`}>
        <rect width="100" height="100" rx="23" fill={MARS_INDIGO} />
        <g transform={inner}>
          <Twins tier={t} tone="reversed" />
        </g>
      </svg>
    </>
  );
}

// "MARS" over "TECHNICAL", as on the brand board. Colours follow the theme
// (--m-word / --m-sub in globals.css): indigo on light, white + lime on dark.
export function MarsWordmark({ size = 17, className }: { size?: number; className?: string }) {
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
          color: "var(--m-word)",
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
          color: "var(--m-sub)",
        }}
      >
        TECHNICAL
      </span>
    </span>
  );
}
