"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast, toastErr } from "@/lib/toast";
import { deleteAgreement } from "@/app/(app)/agreements/actions";
import { useAgreementPdf } from "@/components/agreements/download-pdf";

// Edit / delete for one agreement row. Edit opens the full agreement form;
// delete is permanent (visits, payment info and the contract file go with it).
export default function RowActions({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pdf = useAgreementPdf(id);

  async function remove() {
    if (busy || !confirm(t("ag.confirmDelete"))) return;
    setBusy(true);
    try {
      const res = await deleteAgreement(id);
      if (res.error) toastErr(res.error);
      else {
        toast(t("ag.deleted"), "success");
        router.refresh();
      }
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={pdf.download}
        disabled={pdf.busy}
        aria-label={t("ag.downloadPdf")}
        title={t("ag.downloadPdf")}
        className="icon-btn h-8 w-8 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14" />
        </svg>
      </button>
      <Link
        href={`/agreements/${id}/edit`}
        aria-label={t("ag.edit")}
        title={t("ag.edit")}
        className="icon-btn h-8 w-8"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={t("ag.delete")}
        title={t("ag.delete")}
        className="icon-btn h-8 w-8 hover:!text-red-600 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
        </svg>
      </button>
    </span>
  );
}
