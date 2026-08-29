"use client";

// Floating action button — thumb-reachable primary action on mobile only.
export default function Fab({
  onClick,
  label = "New",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="btn-primary animate-pop fixed right-5 z-30 h-14 w-14 rounded-full p-0 shadow-pop md:hidden"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
