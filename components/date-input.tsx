"use client";

import { useRef } from "react";
import { formatDate } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n/provider";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

// A native date picker that always *shows* dd.mm.yyyy. A bare <input
// type="date"> renders in the viewer's browser/OS locale, so the same app
// showed 10/05/2026 on one phone and 05/10/2026 on another. Here the real
// input is transparent and sits on top (so the native picker, keyboard and
// validation all still work), while the visible text is formatted by us.
export default function DateInput({ className = "", value, onClick, ...rest }: Props) {
  const { lang } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const str = typeof value === "string" ? value : "";

  return (
    <div className="relative">
      <input
        {...rest}
        ref={ref}
        type="date"
        value={value}
        onClick={(e) => {
          // Desktop Chrome only opens the picker from its tiny icon; with the
          // input transparent the whole field should open it.
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* not allowed in this context — the native control still works */
          }
          onClick?.(e);
        }}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <div
        aria-hidden
        className={`${className} flex items-center justify-between gap-2 peer-focus:border-brand-500 peer-focus:ring-2 peer-focus:ring-brand-100 ${
          rest.disabled ? "opacity-60" : ""
        }`}
      >
        <span className={str ? "" : "text-ink-faint"}>
          {str ? formatDate(str) : lang === "tr" ? "gg.aa.yyyy" : "dd.mm.yyyy"}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-ink-faint"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </div>
    </div>
  );
}
