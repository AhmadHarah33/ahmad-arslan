"use client";

import { useEffect, useRef, useState } from "react";

// Animates a number from 0 up to `value` once on mount.
export default function CountUp({
  value,
  duration = 650,
}: {
  value: number;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setN(value);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <>{n}</>;
}
