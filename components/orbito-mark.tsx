// The Orbito mark ("Midnight O"): a ring that is 83% complete with an amber
// moon leading the progress. Geometry matches the brand board; the PNG icons in
// public/icons are rendered from the same shapes (see scripts/make-icons.mjs).
//
// Colours come from the --o-* variables in globals.css, so the mark follows the
// light/dark theme. `ink` pins it to the light-background colours (print pages
// are always white paper, whatever the app theme is).

export const ORBITO_BLACK = "#141414";
export const ORBITO_AMBER = "#FF9F1C";

const INK = { ring: "#1A1A1A", moon: "#E07B00" };

export function OrbitoMark({
  size = 24,
  className,
  ink = false,
}: {
  size?: number;
  className?: string;
  ink?: boolean;
}) {
  const ring = ink ? INK.ring : "var(--o-ring)";
  const moon = ink ? INK.moon : "var(--o-moon)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
    >
      <circle cx="50" cy="50" r="36" fill="none" style={{ stroke: ring }} strokeOpacity="0.18" strokeWidth="19" />
      <path
        d="M50 14 A36 36 0 1 1 18.82 32"
        fill="none"
        style={{ stroke: ring }}
        strokeWidth="19"
        strokeLinecap="round"
      />
      <circle cx="18.82" cy="32" r="12" style={{ fill: moon }} />
    </svg>
  );
}

// App tile: the mark on a theme-aware tile, used in the sidebar, top bar and login.
export function OrbitoTile({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[10px] ${className}`}
      style={{
        width: size,
        height: size,
        background: "var(--o-tile)",
        boxShadow: "inset 0 0 0 1px var(--o-edge)",
      }}
    >
      <OrbitoMark size={Math.round(size * 0.68)} />
    </span>
  );
}
