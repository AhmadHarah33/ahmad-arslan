import type { BackgroundStyle } from "./types";

// 0-100 -> 0-30px.
function blurPx(pct: number): string {
  return `${(pct / 100) * 30}px`;
}

// Apply the global background setting to <html> and cache it locally so the
// (unauthenticated) login screen can render it before any DB round trip.
export function applyBackground(style: BackgroundStyle, blur: number) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-bg", style);
  el.style.setProperty("--bg-blur", blurPx(blur));
  try {
    localStorage.setItem("bg_style", style);
    localStorage.setItem("bg_blur", String(blur));
  } catch {
    /* ignore private-mode storage errors */
  }
}
