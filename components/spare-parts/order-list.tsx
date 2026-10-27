"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SparePart } from "@/lib/types";
import Modal from "@/components/modal";
import { useLanguage, useT } from "@/lib/i18n/provider";
import type { Language } from "@/lib/i18n/dictionary";
import { toast, toastErr } from "@/lib/toast";
import { formatDate } from "@/lib/dates";
import { orderCode } from "@/lib/orders";
import {
  saveOrderList,
  listOrderLists,
  deleteOrderList,
  type OrderListRow,
} from "@/app/(app)/spare-parts/order-actions";

// Fetches the PDF and hands it to the browser as a download, the same way the
// customer history file does.
export async function downloadOrderPdf(id: string, lang: Language) {
  const res = await fetch(`/api/orders/${id}/pdf?lang=${lang}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Could not generate the PDF.");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const filename = match ? decodeURIComponent(match[1]) : "order.pdf";

  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function LangPicker({ lang, onChange }: { lang: Language; onChange: (l: Language) => void }) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("order.pdfLang")}
      className="flex rounded-full bg-surface-soft p-0.5 text-xs"
    >
      {(["tr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => onChange(l)}
          className={`rounded-full px-2.5 py-0.5 font-medium ${
            lang === l ? "bg-brand-600 text-white" : "text-ink-muted"
          }`}
        >
          {l === "tr" ? "Türkçe" : "English"}
        </button>
      ))}
    </div>
  );
}

// Sticky bar shown while picking parts.
export function OrderBar({
  parts,
  pieces,
  onAddLow,
  onCreate,
  onCancel,
}: {
  parts: number;
  pieces: number;
  onAddLow: () => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // Portalled for the same reason as Fab: the app shell's backdrop-filter
  // would otherwise be the containing block for this fixed element. Sits above
  // the phone bottom nav (z-30, ~4.5rem tall).
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-4"
    >
      <div className="glass glass-strong pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl px-4 py-3 shadow-pop">
        <div className="mr-auto flex flex-col">
          <span className="text-sm font-semibold text-ink">
            {parts} {t("order.parts")} · {pieces} {t("order.pieces")}
          </span>
          {parts === 0 && (
            <span className="hidden text-xs text-ink-muted sm:block">{t("order.hint")}</span>
          )}
        </div>
        <button type="button" className="btn-ghost h-10 px-3 text-sm" onClick={onAddLow}>
          {t("order.addLow")}
        </button>
        <button type="button" className="btn-ghost h-10 px-3 text-sm" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary h-10 px-4 text-sm"
          onClick={onCreate}
          disabled={parts === 0}
        >
          {t("order.generate")}
        </button>
      </div>
    </div>,
    document.body
  );
}

// Final review step: supplier / notes, PDF language, then save + download.
export function OrderModal({
  brandId,
  brandName,
  lines,
  onClose,
  onDone,
}: {
  brandId: string;
  brandName: string;
  lines: { part: SparePart; quantity: number }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const { lang: appLang } = useLanguage();
  const [lang, setLang] = useState<Language>(appLang);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await saveOrderList({
        company_id: brandId,
        supplier,
        notes,
        lines: lines.map((l) => ({ spare_part_id: l.part.id, quantity: l.quantity })),
      });
      if (res.error || !res.id) {
        toastErr(res.error ?? "Could not save the order list.");
        return;
      }
      toast(t("order.saved"), "success");
      // The list is saved at this point; a failed PDF can be re-downloaded
      // from the history instead of losing the selection.
      try {
        await downloadOrderPdf(res.id, lang);
      } catch (e) {
        toastErr(e instanceof Error ? e.message : "Could not generate the PDF.");
      }
      onDone();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${t("order.modalTitle")} · ${brandName}`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <LangPicker lang={lang} onChange={setLang} />
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? t("task.pdfPreparing") : t("order.saveDownload")}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">{t("order.supplier")}</label>
          <input
            className="input"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder={t("order.supplierPlaceholder")}
          />
        </div>
        <div>
          <label className="label">{t("order.notes")}</label>
          <textarea
            className="input min-h-[72px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <ul className="overflow-hidden rounded-2xl border border-surface-border">
          {lines.map(({ part, quantity }) => (
            <li
              key={part.id}
              className="flex items-center gap-3 border-b border-surface-border px-3.5 py-2 text-sm last:border-b-0"
            >
              <span className="w-24 shrink-0 truncate text-[13px] font-semibold text-brand-600">
                {part.part_number || "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{part.name}</span>
              <span className="font-bold tabular-nums text-ink">× {quantity}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

// Past order lists: re-download or delete.
export function OrderHistoryModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang: appLang } = useLanguage();
  const [lang, setLang] = useState<Language>(appLang);
  const [rows, setRows] = useState<OrderListRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listOrderLists().then((r) => {
      if (r.error) toastErr(r.error);
      setRows(r.rows);
    });
  }, []);

  async function download(id: string) {
    setBusyId(id);
    try {
      await downloadOrderPdf(id, lang);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Could not generate the PDF.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("order.confirmDelete"))) return;
    const res = await deleteOrderList(id);
    if (res.error) return toastErr(res.error);
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }

  return (
    <Modal
      title={t("order.historyTitle")}
      onClose={onClose}
      footer={<LangPicker lang={lang} onChange={setLang} />}
    >
      {rows === null ? (
        <p className="py-6 text-center text-sm text-ink-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("order.historyEmpty")}</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-surface-border">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-surface-border px-3.5 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-ink">
                  {orderCode(r.number)} · {r.company_name || "—"}
                </span>
                <span className="truncate text-xs text-ink-muted">
                  {[
                    formatDate(r.created_at),
                    `${r.lines} ${t("order.parts")} · ${r.pieces} ${t("order.pieces")}`,
                    r.supplier,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <button
                className="text-sm font-medium text-brand-600 disabled:opacity-60"
                onClick={() => download(r.id)}
                disabled={busyId === r.id}
              >
                {busyId === r.id ? t("task.pdfPreparing") : `⭳ ${t("order.download")}`}
              </button>
              <button
                aria-label={t("common.delete")}
                className="text-sm hover:underline"
                style={{ color: "rgb(var(--tone-stuck-ink))" }}
                onClick={() => remove(r.id)}
              >
                {t("common.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
