"use client";

import { useEffect, useRef, useState } from "react";

export default function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Swipe-down-to-dismiss on the grab handle (mobile).
  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    setDrag(Math.max(0, e.touches[0].clientY - startY.current));
  }
  function onTouchEnd() {
    if (drag > 110) onClose();
    setDrag(0);
    startY.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div className="animate-overlay absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className="glass glass-strong animate-window relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl"
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : "transform 0.2s" }}
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
            onClick={onClose}
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
    </div>
  );
}
