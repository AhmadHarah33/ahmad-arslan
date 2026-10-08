"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";

// Fetches the PDF rather than using a plain link so a failed render (e.g. a
// missing Chromium install) is reported instead of silently doing nothing.
export function useAgreementPdf(id: string) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agreements/${id}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Could not generate the PDF.");
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const filename = match ? decodeURIComponent(match[1]) : `agreement-${id}.pdf`;

      const url = URL.createObjectURL(await res.blob());
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

  return { busy, download };
}

// Preview + download, like the task report: Preview opens the printable page
// in a new tab, Download saves it as a PDF.
export default function DownloadAgreementPdf({ id }: { id: string }) {
  const t = useT();
  const { busy, download } = useAgreementPdf(id);
  return (
    <div className="flex items-center gap-3">
      <a
        href={`/print/agreement/${id}`}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium text-ink-faint underline-offset-2 hover:underline"
      >
        {t("task.previewReport")}
      </a>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="text-sm font-medium text-brand-600 disabled:opacity-60"
      >
        {busy ? t("task.pdfPreparing") : `⭳ ${t("ag.downloadPdf")}`}
      </button>
    </div>
  );
}
