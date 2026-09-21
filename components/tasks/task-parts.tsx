"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addTaskPart,
  removeTaskPart,
  setTaskPartPrice,
  setTaskPartQuantity,
} from "@/app/(app)/tasks/parts-actions";
import { useAction } from "@/lib/use-action";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import { formatAmount, parseAmount, sanitizeAmount } from "@/lib/money";

// A part attached to a task that doesn't exist yet — held here instead of in
// task_parts (which needs a real task_id) until the task is first saved, at
// which point the task modal attaches all of them in one bulk call.
// `priceText` stays a raw string, like the parts_cost/service_charge fields,
// so a decimal point being typed doesn't get eaten mid-keystroke.
export type DraftPart = {
  localId: string;
  spare_part_id: string;
  name: string;
  quantity: number;
  priceText: string;
};

export function draftPartsTotal(rows: DraftPart[]): number {
  return rows.reduce((sum, r) => sum + (parseAmount(r.priceText) ?? 0) * r.quantity, 0);
}

type PartOption = { id: string; name: string; price: number | null };
type UsedRow = {
  id: string;
  spare_part_id: string;
  name: string;
  quantity: number;
  priceText: string;
};

// Records spare parts consumed on a task, priced for this job specifically —
// the catalog price is only the starting suggestion when a part is picked;
// from there it's editable per line, same as quantity.
//
// Choosing a part attaches it immediately. This used to be a three-step row —
// pick a part, set a quantity, then press a separate "Add" — and picking a
// part and then pressing the modal's Save attached nothing and said nothing,
// which is exactly how tasks reached Done with the parts still in the
// engineer's head. Quantity and price are edited on the attached row instead.
export default function TaskParts({
  taskId,
  editable,
  currencySymbol,
  draft,
  onDraftChange,
  onTotalsChange,
}: {
  // Omit for a task that hasn't been saved yet: rows live in `draft` (owned
  // by the parent) instead of being written straight to task_parts.
  taskId?: string;
  editable: boolean;
  currencySymbol: string;
  draft?: DraftPart[];
  onDraftChange?: (rows: DraftPart[]) => void;
  // Count + cost total across all rows, so the task modal can show a
  // computed parts cost and the "will be sent for approval" notice without
  // re-querying task_parts itself.
  onTotalsChange?: (totals: { count: number; total: number }) => void;
}) {
  const t = useT();
  const local = !taskId;

  const [used, setUsed] = useState<UsedRow[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      if (local) {
        const { data: sp } = await supabase
          .from("spare_parts")
          .select("id, name, price")
          .order("name");
        if (active) setParts((sp ?? []) as PartOption[]);
        return;
      }
      const [{ data: tp }, { data: sp }] = await Promise.all([
        supabase
          .from("task_parts")
          .select("id, spare_part_id, quantity, unit_price, part:spare_part_id(name)")
          .eq("task_id", taskId),
        supabase.from("spare_parts").select("id, name, price").order("name"),
      ]);
      if (!active) return;
      setUsed(
        (tp ?? []).map((r: any) => ({
          id: r.id,
          spare_part_id: r.spare_part_id,
          name: r.part?.name ?? "Part",
          quantity: r.quantity,
          priceText: r.unit_price != null ? String(r.unit_price) : "",
        }))
      );
      setParts((sp ?? []) as PartOption[]);
    }
    load();
    return () => {
      active = false;
    };
  }, [taskId, local]);

  // The rows actually rendered: the parent's draft in local mode, the
  // fetched task_parts rows otherwise — one render path either way.
  const rows: UsedRow[] = local
    ? (draft ?? []).map((d) => ({
        id: d.localId,
        spare_part_id: d.spare_part_id,
        name: d.name,
        quantity: d.quantity,
        priceText: d.priceText,
      }))
    : used;

  // Reporting totals from an effect, not from inside the state updaters:
  // calling the parent's setState during another component's render is a
  // React warning, and updaters can run more than once.
  const notify = useRef(onTotalsChange);
  notify.current = onTotalsChange;
  useEffect(() => {
    const total = rows.reduce((sum, r) => sum + (parseAmount(r.priceText) ?? 0) * r.quantity, 0);
    notify.current?.({ count: rows.length, total });
  }, [rows]);

  const { run: attachPart, pending: busy } = useAction(addTaskPart);
  const { run: detachPart } = useAction(removeTaskPart);
  const { run: saveQuantity } = useAction(setTaskPartQuantity);
  const { run: savePrice } = useAction(setTaskPartPrice);

  function setDraft(next: DraftPart[]) {
    onDraftChange?.(next);
  }

  async function pick(sparePartId: string) {
    if (!sparePartId) return;
    const part = parts.find((p) => p.id === sparePartId);
    const name = part?.name ?? "Part";
    const priceText = part?.price != null ? String(part.price) : "";
    if (local) {
      setDraft([
        ...(draft ?? []),
        { localId: `tmp-${Date.now()}`, spare_part_id: sparePartId, name, quantity: 1, priceText },
      ]);
      return;
    }
    const res = await attachPart(taskId!, sparePartId, 1, parseAmount(priceText));
    if (!res) return;
    setUsed((prev) => [
      ...prev,
      { id: (res as any)?.row?.id ?? `tmp-${Date.now()}`, spare_part_id: sparePartId, name, quantity: 1, priceText },
    ]);
  }

  async function changeQuantity(id: string, next: number) {
    const clamped = Math.max(1, Math.round(next) || 1);
    if (local) {
      setDraft((draft ?? []).map((d) => (d.localId === id ? { ...d, quantity: clamped } : d)));
      return;
    }
    setUsed((prev) => prev.map((r) => (r.id === id ? { ...r, quantity: clamped } : r)));
    const res = await saveQuantity(id, clamped);
    if (!res) toastErr(t("task.partQuantityFailed"));
  }

  function changePriceText(id: string, raw: string) {
    const priceText = sanitizeAmount(raw);
    if (local) {
      setDraft((draft ?? []).map((d) => (d.localId === id ? { ...d, priceText } : d)));
      return;
    }
    setUsed((prev) => prev.map((r) => (r.id === id ? { ...r, priceText } : r)));
  }

  async function commitPrice(id: string, priceText: string) {
    if (local) return; // already committed to the draft on every keystroke
    const res = await savePrice(id, parseAmount(priceText));
    if (!res) toastErr(t("task.partPriceFailed"));
  }

  async function remove(id: string) {
    if (local) {
      setDraft((draft ?? []).filter((d) => d.localId !== id));
      return;
    }
    const res = await detachPart(id);
    if (res) setUsed((prev) => prev.filter((r) => r.id !== id));
  }

  // A part already on the task is dropped from the picker rather than adding
  // a second row for the same part.
  const available = parts.filter((p) => !rows.some((r) => r.spare_part_id === p.id));

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-ink-faint">{t("task.noParts")}</p>
      )}

      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
          {editable ? (
            <>
              <label className="sr-only" htmlFor={`qty-${r.id}`}>
                {t("parts.quantity")}
              </label>
              <input
                id={`qty-${r.id}`}
                type="number"
                min={1}
                className="input h-8 w-14 py-1 text-sm"
                value={r.quantity}
                onChange={(e) => changeQuantity(r.id, Number(e.target.value))}
              />
              <span className="shrink-0 text-xs text-ink-faint">{currencySymbol}</span>
              <label className="sr-only" htmlFor={`price-${r.id}`}>
                {t("task.partPrice")}
              </label>
              <input
                id={`price-${r.id}`}
                type="text"
                inputMode="decimal"
                className="input h-8 w-20 py-1 text-sm"
                placeholder="0"
                value={r.priceText}
                onChange={(e) => changePriceText(r.id, e.target.value)}
                onBlur={(e) => commitPrice(r.id, e.target.value)}
              />
              <button
                onClick={() => remove(r.id)}
                className="shrink-0 text-xs font-medium"
                style={{ color: "rgb(var(--tone-stuck-ink))" }}
              >
                {t("common.delete")}
              </button>
            </>
          ) : (
            <span className="text-sm text-ink-faint">
              × {r.quantity} · {currencySymbol}
              {formatAmount(parseAmount(r.priceText))}
            </span>
          )}
        </div>
      ))}

      {editable && (
        <select
          className="input"
          value=""
          disabled={busy || available.length === 0}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">
            {available.length === 0 ? t("task.allPartsAdded") : t("task.addPart")}
          </option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
