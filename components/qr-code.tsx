"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Renders a QR code (as an <img> data URL) for the given value.
export default function QrCode({
  value,
  size = 140,
}: {
  value: string;
  size?: number;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then(setUrl)
      .catch(() => setUrl(""));
  }, [value, size]);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} width={size} height={size} alt="QR code" />;
}

// Build the URL a customer QR should encode (opens the app filtered to them).
export function customerQrValue(name: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "";
  return `${origin}/customers?q=${encodeURIComponent(name)}`;
}
