"use client";

import { useState } from "react";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import type { Language } from "@/lib/i18n/dictionary";

// Generates the customer's history file (all finished tasks as a 5-column
// PDF) on demand. Built fresh on every click, so it always reflects the
// latest tasks. The PDF language defaults to the app language but can be
// switched per download.
export default function HistoryFileButton({ customerId }: { customerId: string }) {
  const t = useT();
  const { lang: appLang } = useLanguage();
  const [pdfLang, setPdfLang] = useState<Language | null>(null);
  const [busy, setBusy] = useState(false);
  const lang = pdfLang ?? appLang;

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/history-pdf?lang=${lang}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Could not generate the PDF.");
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = match ? decodeURIComponent(match[1]) : "history.pdf";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Could not generate the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="text-sm font-medium text-brand-600 disabled:opacity-60"
      >
        {busy ? t("task.pdfPreparing") : `⭳ ${t("customers.historyFile")}`}
      </button>
      <div
        role="radiogroup"
        aria-label={t("customers.historyFileLang")}
        className="flex rounded-full bg-surface-soft p-0.5 text-xs"
      >
        {(["tr", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => setPdfLang(l)}
            className={`rounded-full px-2.5 py-0.5 font-medium ${
              lang === l ? "bg-brand-600 text-white" : "text-ink-muted"
            }`}
          >
            {l === "tr" ? "Türkçe" : "English"}
          </button>
        ))}
      </div>
    </div>
  );
}
