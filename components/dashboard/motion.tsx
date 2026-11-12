"use client";

import { useEffect, useRef, useState } from "react";

// Small animation helpers for the dashboard. No animation library: a count-up
// driven by requestAnimationFrame, and an in-view flag for CSS transitions.
// Everything snaps to its final state when the user prefers reduced motion.

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// True once the element has scrolled into view (and stays true).
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

// Eases from 0 to `value` once, the first time `start` is true; follows later
// changes of `value` with a shorter tween.
export function useCountUp(value: number, start: boolean, duration = 1100) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) {
      setN(value);
      return;
    }
    const begin = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
      const v = begin + (value - begin) * eased;
      from.current = v;
      setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, start, duration]);
  return n;
}

// "18.0" with a muted decimal, counting up. `decimals` is shown as a greyed
// fraction even for whole numbers, matching the dashboard look.
export function CountUp({
  value,
  decimals = 0,
  mutedDecimals = false,
  prefix,
  className,
  format,
}: {
  value: number;
  decimals?: number;
  mutedDecimals?: boolean;
  prefix?: string;
  className?: string;
  format?: (n: number) => string;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const n = useCountUp(value, seen);
  // Whole numbers count in whole steps so the ".0" stays still instead of the
  // decimal digit spinning.
  const step = (v: number) => (Number.isInteger(value) ? Math.round(v) : v);
  const render = (v: number) => (format ? format(step(v)) : step(v).toFixed(decimals));
  const parts = (text: string) => {
    const dot = text.lastIndexOf(".");
    return mutedDecimals && dot >= 0
      ? { whole: text.slice(0, dot), frac: text.slice(dot) }
      : { whole: text, frac: "" };
  };
  const shown = (text: string) => {
    const { whole, frac } = parts(text);
    return (
      <>
        {prefix && <span className="text-ink-faint">{prefix}</span>}
        {whole}
        {frac && <span className="text-ink-faint">{frac}</span>}
      </>
    );
  };
  // The final value is laid out invisibly underneath so the box never changes
  // width while the digits count, which would shove neighbouring text around.
  return (
    <span ref={ref} className={`inline-grid tabular-nums ${className ?? ""}`}>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {shown(render(value))}
      </span>
      <span className="col-start-1 row-start-1">{shown(render(n))}</span>
    </span>
  );
}

// Fades and lifts its children in, `delay` ms after it enters view.
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(14px) scale(0.985)",
        transition: `opacity 600ms cubic-bezier(.2,.7,.2,1) ${delay}ms, transform 600ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
