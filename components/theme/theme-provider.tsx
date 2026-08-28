"use client";

import { useEffect } from "react";
import { applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";

// Seeds the theme from the user's saved DB profile on mount, so their choice
// follows them across devices. (The inline script in app/layout.tsx already
// applied the per-device localStorage value before paint to avoid a flash.)
export default function ThemeProvider({
  accent,
  mode,
}: {
  accent: string;
  mode: ThemeMode;
}) {
  useEffect(() => {
    applyTheme(accent || "sky", mode || "system");
  }, [accent, mode]);
  return null;
}
