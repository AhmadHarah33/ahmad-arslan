"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { toast, toastErr } from "@/lib/toast";
import { formatDate } from "@/lib/dates";
import {
  attachReceipt,
  getReceiptUrl,
  removeReceipt,
  setPaymentStatus,
} from "@/app/(app)/agreements/actions";
import type { PaymentStatus } from "@/lib/types";

const MAX_RECEIPT = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Paid / unpaid for one saved agreement, with the accounting receipt (makbuz)
// that proves the service was recorded. The receipt comes first: "Mark as paid"
// stays disabled until one is on file, and the server and database refuse a
// paid agreement without it. Every button here saves immediately.
export default function PaymentReceipt({
  agreementId,
  paymentStatus,
  paidAt,
  receiptPath,
}: {
  agreementId: string;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  receiptPath: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const paid = paymentStatus === "paid";

  async function run(fn: () => Promise<{ error?: string }>, okMsg?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) return toastErr(res.error);
      if (okMsg) toast(okMsg, "success");
      router.refresh();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File | null) {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = TYPES[ext];
    if (!type) return toastErr(t("ag.receiptType"));
    if (file.size > MAX_RECEIPT) return toastErr(t("ag.receiptTooBig"));
    run(async () => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${agreementId}/${Date.now()}-${safe}`;
      const up = await createClient()
        .storage.from("agreement-receipts")
        .upload(path, file, { contentType: type });
      if (up.error) return { error: `${t("ag.receiptUploadFailed")} ${up.error.message}` };
      return attachReceipt(agreementId, path);
    }, t("ag.receiptUploaded"));
  }

  async function open() {
    const res = await getReceiptUrl(agreementId);
    if (res.error || !("url" in res) || !res.url) return toastErr(res.error ?? "No receipt.");
    window.open(res.url, "_blank", "noopener");
  }

  const fileName = receiptPath?.split("/").pop()?.replace(/^\d+-/, "");

  return (
    <div className="space-y-4">
      <div>
        <label className="label">{t("ag.pay.status")}</label>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`${paid ? "tone-done" : "tone-stuck"} rounded-full px-3 py-1 text-sm font-semibold`}
          >
            {paid ? t("ag.pay.paid") : t("ag.status.unpaid")}
          </span>
          {paid && paidAt && (
            <span className="text-sm text-ink-muted">
              {t("ag.pay.paidOn")} {formatDate(paidAt)}
            </span>
          )}
          {paid ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() =>
                run(() => setPaymentStatus(agreementId, false), t("ag.pay.updated"))
              }
            >
              {t("ag.pay.markUnpaid")}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !receiptPath}
              title={receiptPath ? undefined : t("ag.pay.needReceipt")}
              onClick={() =>
                run(() => setPaymentStatus(agreementId, true), t("ag.pay.updated"))
              }
            >
              {t("ag.pay.markPaid")}
            </button>
          )}
        </div>
        {!paid && !receiptPath && (
          <p className="mt-2 text-xs text-ink-muted">{t("ag.pay.needReceipt")}</p>
        )}
      </div>

      <div>
        <label className="label">{t("ag.receipt")}</label>
        {receiptPath && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-soft px-3.5 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{fileName}</span>
            <button type="button" className="text-ink-muted hover:text-ink" onClick={open}>
              {t("ag.openReceipt")}
            </button>
            {!paid && (
              <button
                type="button"
                className="text-red-500"
                disabled={busy}
                onClick={() => run(() => removeReceipt(agreementId))}
              >
                {t("ag.removeReceipt")}
              </button>
            )}
          </div>
        )}
        {paid ? (
          <p className="text-xs text-ink-muted">{t("ag.receiptLocked")}</p>
        ) : (
          <>
            <label className={`btn-ghost cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
              {receiptPath ? t("ag.replaceReceipt") : t("ag.uploadReceipt")}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  upload(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-2 text-xs text-ink-faint">{t("ag.receiptHint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
