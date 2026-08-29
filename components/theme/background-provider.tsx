"use client";

import { useEffect } from "react";
import { applyBackground } from "@/lib/background";
import type { BackgroundStyle } from "@/lib/types";

// Seeds the global background setting from the DB (app_settings) on mount, so
// the owner's choice applies for everyone. (The inline script in
// app/layout.tsx already applied the cached localStorage value before paint.)
export default function BackgroundProvider({
  style,
  blur,
}: {
  style: BackgroundStyle;
  blur: number;
}) {
  useEffect(() => {
    applyBackground(style, blur);
  }, [style, blur]);
  return null;
}
