"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Floating action button — thumb-reachable primary action on mobile only.
//
// Portalled to <body> for the same reason Modal and DragOverlay are: it's
// position:fixed, and the app shell wraps page content in a `.glass-strong`
// panel whose backdrop-filter makes that panel the containing block for
// fixed descendants, which floats a non-portalled fixed element away from
// where the viewport puts it instead of pinning it to the corner.
export default function Fab({
  onClick,
  label = "New",
}: {
  onClick: () => void;
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <button
      onClick={onClick}
      aria-label={label}
      className="btn-primary fixed right-5 z-30 h-14 w-14 rounded-full p-0 shadow-pop md:hidden"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>,
    document.body
  );
}
