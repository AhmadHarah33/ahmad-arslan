"use client";

import { useEffect } from "react";

// Opens the browser print dialog shortly after the report renders.
export default function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      onClick={() => window.print()}
      className="mb-4 rounded-lg bg-[#0284c7] px-4 py-2 text-sm font-medium text-white print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
