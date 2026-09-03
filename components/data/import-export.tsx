"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/modal";
import { useT } from "@/lib/i18n/provider";
import { parseCsv, pick, toCsv, downloadCsv } from "@/lib/csv";
import { importCustomers, importParts } from "@/app/(app)/data/actions";

export default function ImportExport({
  kind,
  columns,
  exportRows,
}: {
  kind: "customers" | "parts";
  columns: string[];
  exportRows: Record<string, unknown>[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function onFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
  }

  async function runImport() {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setMsg(t("io.noRows"));
      return;
    }
    setBusy(true);
    setMsg(null);
    const res =
      kind === "customers"
        ? await importCustomers(
            rows.map((r) => ({
              name: pick(r, "name", "customer"),
              city: pick(r, "city", "location"),
              model: pick(r, "model", "machine"),
              sn: pick(r, "sn", "serial", "serial_number"),
              brand: pick(r, "brand"),
            }))
          )
        : await importParts(
            rows.map((r) => ({
              company: pick(r, "company", "brand", "vendor"),
              name: pick(r, "name", "part"),
              part_number: pick(r, "part_number", "part #", "part number", "pn"),
              quantity: pick(r, "quantity", "qty"),
            }))
          );
    setBusy(false);
    if (res?.error) {
      setMsg(res.error);
      return;
    }
    setMsg(`Imported ${res?.count ?? 0} rows.`);
    setText("");
    router.refresh();
  }

  function runExport() {
    downloadCsv(`${kind}.csv`, toCsv(exportRows, columns));
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        {t("io.button")}
      </button>
      {open && (
        <Modal title={t("io.button")} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <p className="label">Export</p>
              <button className="btn-ghost" onClick={runExport}>
                ⭳ Download {kind}.csv ({exportRows.length})
              </button>
            </div>

            <div className="border-t border-surface-border pt-4">
              <p className="label">{t("io.import")}</p>
              <p className="mb-2 text-xs text-ink-faint">
                CSV columns:{" "}
                <span className="font-medium">
                  {kind === "customers"
                    ? "name, city, model, sn, brand"
                    : "company, name, part_number, quantity"}
                </span>
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="mb-2 block text-sm"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <textarea
                className="input min-h-[120px] font-mono text-xs"
                placeholder="…or paste CSV here"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {msg && <p className="mt-2 text-sm text-ink-muted">{msg}</p>}
              <div className="mt-3 flex justify-end">
                <button className="btn-primary" onClick={runImport} disabled={busy || !text.trim()}>
                  {busy ? t("io.importing") : t("io.import")}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
