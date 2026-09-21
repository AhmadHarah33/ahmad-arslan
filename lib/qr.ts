// Build the URL a customer QR should encode (opens the app filtered to them).
// Kept out of qr-code.tsx (a "use client" file) so server components — the
// print page renders one server-side — can call it directly. A plain
// function export from a client-boundary module isn't safely callable from
// server code in production RSC bundling.
export function customerQrValue(name: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "";
  return `${origin}/customers?q=${encodeURIComponent(name)}`;
}
