"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";

// Fetches the PDF instead of a plain <a download> link, because a plain link
// can't report a failed render (missing Chromium install, a crashed page) —
// it just does nothing and leaves the user guessing.
export default function DownloadPdfButton({ taskId }: { taskId: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  async function download() {
    setState("busy");
    try {
      const res = await fetch(`/api/tasks/${taskId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Could not generate the PDF.");
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const filename = match ? decodeURIComponent(match[1]) : `task-${taskId}.pdf`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the save in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setState("idle");
    } catch (e) {
      setState("failed");
      toastErr(e instanceof Error ? e.message : "Could not generate the PDF.");
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={state === "busy"}
      className="text-sm font-medium text-brand-600 disabled:opacity-60"
    >
      {state === "busy"
        ? t("task.pdfPreparing")
        : state === "failed"
        ? t("task.pdfFailedRetry")
        : `⭳ ${t("task.downloadReport")}`}
    </button>
  );
}
