"use client";

import { useT } from "@/lib/i18n/provider";

// The search button, sat beside a page's primary action — the
// same treatment as the home header. Desktop only; phones have search in the
// top bar.
export default function PageTools() {
  const t = useT();
  return (
    <div className="hidden items-center gap-3 md:flex">
      <button
        onClick={() => window.dispatchEvent(new Event("app:open-search"))}
        aria-label={t("shell.search")}
        title="Search (⌘K)"
        className="card flex items-center gap-2 rounded-full py-2 pl-3.5 pr-3 text-sm text-ink-faint transition hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
        <span className="hidden lg:inline">{t("shell.search")}</span>
        <kbd className="hidden rounded border border-surface-border px-1 py-0.5 text-[10px] font-medium lg:inline">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}
