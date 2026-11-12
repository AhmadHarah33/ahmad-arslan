// A drawn Mars for the login screen: rust surface with dark and bright
// mottling from fractal noise, a polar cap, a lit side and a thin atmosphere.
// Pure SVG, no image file. Drop a real photo at public/bg/mars.jpg and the
// login page uses that instead.
export default function MarsPlanet({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 1000"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label="Mars"
    >
      <defs>
        <radialGradient id="mp-space" cx="35%" cy="30%" r="95%">
          <stop offset="0" stopColor="#14100f" />
          <stop offset="1" stopColor="#030304" />
        </radialGradient>
        <radialGradient id="mp-base" gradientUnits="userSpaceOnUse" cx="330" cy="400" r="470">
          <stop offset="0" stopColor="#f0b384" />
          <stop offset="0.35" stopColor="#c8693a" />
          <stop offset="0.75" stopColor="#8a3a1c" />
          <stop offset="1" stopColor="#4a1d0e" />
        </radialGradient>
        <radialGradient id="mp-shade" gradientUnits="userSpaceOnUse" cx="315" cy="385" r="520">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.4" stopColor="#000" stopOpacity="0.1" />
          <stop offset="0.72" stopColor="#000" stopOpacity="0.62" />
          <stop offset="0.95" stopColor="#000" stopOpacity="0.96" />
        </radialGradient>
        <radialGradient id="mp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0.86" stopColor="#ff9a5c" stopOpacity="0" />
          <stop offset="0.93" stopColor="#ff9a5c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7fb2ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mp-cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="mp-dark" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.006" numOctaves="6" seed="11" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.2  0 0 0 0 0.07  0 0 0 0 0.03  -3.4 0 0 0 1.95"
          />
        </filter>
        <filter id="mp-bright" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="5" seed="4" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 0.75  0 0 0 0 0.52  0 3 0 0 -1.45"
          />
        </filter>
        <filter id="mp-fine" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="2" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 2 0 -0.45"
          />
        </filter>
        <filter id="mp-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <clipPath id="mp-disc">
          <circle cx="400" cy="500" r="330" />
        </clipPath>
      </defs>

      <rect width="800" height="1000" fill="url(#mp-space)" />

      {/* Stars */}
      <g fill="#fff">
        {[
          [60, 90, 1.3, 0.8],
          [160, 40, 1, 0.6],
          [90, 240, 1.6, 0.9],
          [210, 150, 0.9, 0.5],
          [40, 420, 1.2, 0.7],
          [120, 640, 1, 0.5],
          [60, 820, 1.5, 0.8],
          [190, 930, 1, 0.6],
          [330, 60, 1.1, 0.6],
          [700, 70, 1.4, 0.8],
          [760, 210, 1, 0.6],
          [740, 940, 1.2, 0.7],
        ].map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={o} />
        ))}
      </g>

      {/* Atmosphere */}
      <circle cx="400" cy="500" r="372" fill="url(#mp-glow)" />

      {/* Planet */}
      <g clipPath="url(#mp-disc)">
        <rect x="0" y="0" width="800" height="1000" fill="url(#mp-base)" />
        <rect x="0" y="0" width="800" height="1000" filter="url(#mp-dark)" opacity="0.85" />
        <rect x="0" y="0" width="800" height="1000" filter="url(#mp-bright)" opacity="0.32" />
        <rect x="0" y="0" width="800" height="1000" filter="url(#mp-fine)" opacity="0.22" />
        <ellipse cx="400" cy="188" rx="130" ry="34" fill="url(#mp-cap)" filter="url(#mp-blur)" />
        <rect x="0" y="0" width="800" height="1000" fill="url(#mp-shade)" />
      </g>
    </svg>
  );
}
