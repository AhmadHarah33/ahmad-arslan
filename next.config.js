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
  // playwright-core has optional requires (chromium-bidi, kerberos, …) for
  // protocols/drivers this app never uses; bundling it for the PDF route
  // handler makes webpack try to resolve those and fail the build. Keeping
  // it external makes Node `require` it directly at runtime instead.
  experimental: {
    serverComponentsExternalPackages: ["playwright-core"],
  },
  images: {
    // Allow Supabase Storage-served images (local + tunnel domain).
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = withPWA(nextConfig);
