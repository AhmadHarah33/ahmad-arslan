"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Longest close variant across breakpoints (mobile sheet-down); the desktop
// pop-out is shorter but finishing early just means the panel sits invisible
// for the last few ms before unmount, which is imperceptible.
const CLOSE_MS = 220;

export default function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Roomier surface for writing-focused dialogs (long descriptions). */
  wide?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Plays the exit animation before actually unmounting, so the sheet/dialog
  // slides or fades away instead of just vanishing on the frame it's closed.
  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(() => onCloseRef.current(), CLOSE_MS);
  }

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe-down-to-dismiss on the grab handle (mobile).
  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    setDrag(Math.max(0, e.touches[0].clientY - startY.current));
  }
  function onTouchEnd() {
    if (drag > 110) {
      requestClose();
    } else {
      setDrag(0);
    }
    startY.current = null;
  }

  // Portalled to <body> on purpose. The app shell wraps page content in a
  // `.glass-strong` panel, and a non-none backdrop-filter makes that panel the
  // containing block for `position: fixed` descendants — so rendering inline
  // pinned the overlay to the (tall, scrolling) content box instead of the
  // viewport, and its `overflow-hidden` clipped it. On a long page that pushed
  // the dialog off-screen entirely.
  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4 ${
        closing ? "pointer-events-none" : ""
      }`}
    >
      <div
        className={`absolute inset-0 ${closing ? "animate-overlay-out" : "animate-overlay"}`}
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        className={`glass glass-strong relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-3xl sm:rounded-3xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        } ${closing ? "animate-window-out" : "animate-window"}`}
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: drag ? "none" : "transform 0.2s",
          willChange: "transform",
        }}
      >
        {/* Grab handle (mobile) */}
        <div
          className="shrink-0 touch-none sm:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="sheet-handle" />
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            onClick={requestClose}
            className="rounded-lg p-1 text-ink-faint hover:bg-surface-soft hover:text-ink"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div
            className="shrink-0 border-t border-surface-border px-5 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
