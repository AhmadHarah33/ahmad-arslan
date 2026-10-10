const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    disableDevLogs: true,
    // Without these, a deployed update sits as an installed-but-inactive
    // service worker until every tab of the app is closed, so a redeploy
    // silently keeps serving the previous build's JS to anyone with a tab
    // open. Take over immediately instead.
    skipWaiting: true,
    clientsClaim: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next dev` must never share a build folder with the production server
  // (`next start` on port 3000): dev overwrites .next, and the live site then
  // loses its JavaScript. Keep dev output in its own folder.
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  // playwright-core has optional requires (chromium-bidi, kerberos, …) for
  // protocols/drivers this app never uses; bundling it for the PDF route
  // handler makes webpack try to resolve those and fail the build. Keeping
  // it external makes Node `require` it directly at runtime instead.
  serverExternalPackages: ["playwright-core"],
  // The app never uses next/image, so switch the image optimizer off (it has
  // had its own remote-code-execution advisory) and allow no remote hosts.
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
};

module.exports = withPWA(nextConfig);
