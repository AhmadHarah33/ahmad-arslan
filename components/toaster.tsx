"use client";

import { useEffect, useState } from "react";
import type { ToastType } from "@/lib/toast";

type Toast = { id: number; message: string; type: ToastType };

const STYLES: Record<ToastType, string> = {
  error: "border-red-300 text-red-700",
  success: "border-green-300 text-green-700",
  info: "border-surface-border text-ink",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let n = 0;
    function onToast(e: Event) {
      const { message, type } = (e as CustomEvent).detail as {
        message: string;
        type: ToastType;
      };
      const id = ++n;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    }
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`glass pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-pop ${STYLES[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
