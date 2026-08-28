// Theme presets for the per-user accent + light/dark setting.

export type ThemeMode = "light" | "dark" | "system";

export interface AccentPreset {
  id: string; // matches the [data-accent="…"] selector in globals.css
  label: string;
  swatch: string; // a representative hex for the picker swatch
}

// `sky` is the default (light blue) and needs no [data-accent] attribute.
export const ACCENTS: AccentPreset[] = [
  { id: "sky", label: "Light blue", swatch: "#0ea5e9" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "emerald", label: "Emerald", swatch: "#059669" },
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "slate", label: "Slate", swatch: "#475569" },
];

export const DEFAULT_ACCENT = "sky";
export const DEFAULT_MODE: ThemeMode = "system";

export const MODES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

// Apply a theme to <html> and persist to localStorage (client-only).
export function applyTheme(accent: string, mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-accent", accent);
  if (mode === "system") el.removeAttribute("data-mode");
  else el.setAttribute("data-mode", mode);
  try {
    localStorage.setItem("theme_accent", accent);
    localStorage.setItem("theme_mode", mode);
  } catch {
    /* ignore private-mode storage errors */
  }
}
