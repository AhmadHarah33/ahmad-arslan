"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { toast, toastErr } from "@/lib/toast";
import { formatDate } from "@/lib/dates";
import { formatAmount, parseAmount, sanitizeAmount } from "@/lib/money";
import {
  defaultEndDate,
  spreadVisitDates,
  visitsForPlan,
  warrantyEndFrom,
} from "@/lib/agreements";
import {
  attachContract,
  getContractUrl,
  removeContract,
  saveAgreement,
  setMachineWarranty,
  updateAgreement,
} from "@/app/(app)/agreements/actions";
import type {
  AgreementPlan,
  AgreementStatus,
  RemindDays,
  TaskCurrency,
  WarrantyCoverage,
} from "@/lib/types";

export type FormCustomer = { id: string; name: string; contact_person: string };
export type FormMachine = {
  id: string;
  customer_id: string;
  label: string;
  serial_number: string;
  warranty_end: string | null;
};
export type FormTech = { id: string; name: string };

// What an existing agreement looks like to the form. Absent = a new one.
export type FormInitial = {
  id: string;
  status: AgreementStatus;
  customer_id: string;
  plan: AgreementPlan;
  visits_per_year: number;
  start_date: string;
  end_date: string;
  machine_ids: string[];
  technician_ids: string[];
  includes_warranty: boolean;
  warranty_end: string | null;
  coverage: WarrantyCoverage | null;
  warranty_months: number | null;
  remind_days: RemindDays;
  amount: number | null;
  currency: TaskCurrency;
  payment_due: string | null;
  notes: string;
  contract_path: string | null;
  visits: { id: string; due_date: string; done_at: string | null }[];
};

const PLANS: AgreementPlan[] = ["periodic", "annual", "warranty"];
const PRESETS = [2, 3, 4, 6, 12];
const MONTH_OPTIONS = [6, 12, 24, 36, 48, 60];
const COVERAGES: WarrantyCoverage[] = ["parts_labour", "labour", "parts"];
const MAX_CONTRACT = 10 * 1024 * 1024;

const PLAN_TONE: Record<AgreementPlan, string> = {
  periodic: "tone-progress",
  annual: "tone-purple",
  warranty: "tone-orange",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AgreementForm({
  customers,
  machines,
  technicians,
  initial,
  presetCustomerId,
}: {
  customers: FormCustomer[];
  machines: FormMachine[];
  technicians: FormTech[];
  initial?: FormInitial;
  presetCustomerId?: string;
}) {
  const t = useT();
  const router = useRouter();

  // new: nothing saved yet · draft: saved but not live (rebuilt on save) ·
  // live: active/ended (plan and visit count are fixed, dates can move).
  const mode: "new" | "draft" | "live" = !initial
    ? "new"
    : initial.status === "draft"
      ? "draft"
      : "live";
  const live = mode === "live";

  const [customerId, setCustomerId] = useState(
    initial?.customer_id ?? presetCustomerId ?? ""
  );
  const [machineIds, setMachineIds] = useState<string[]>(initial?.machine_ids ?? []);
  const [plan, setPlan] = useState<AgreementPlan>(initial?.plan ?? "periodic");
  const [perYear, setPerYear] = useState(
    initial && initial.plan === "periodic" ? initial.visits_per_year : 2
  );
  const [start, setStart] = useState(initial?.start_date ?? todayIso());
  const [end, setEnd] = useState(initial?.end_date ?? defaultEndDate(todayIso()));
  const [addWarranty, setAddWarranty] = useState(initial?.includes_warranty ?? false);
  const [months, setMonths] = useState<number>(initial?.warranty_months ?? 12);
  const [warrantyEnd, setWarrantyEnd] = useState(initial?.warranty_end ?? "");
  const [warrantyTouched, setWarrantyTouched] = useState(!!initial?.warranty_end);
  const [coverage, setCoverage] = useState<WarrantyCoverage>(
    initial?.coverage ?? "parts_labour"
  );
  const [remind, setRemind] = useState<RemindDays>(initial?.remind_days ?? 7);
  const [techIds, setTechIds] = useState<string[]>(initial?.technician_ids ?? []);
  const [price, setPrice] = useState(
    initial?.amount != null ? String(initial.amount) : ""
  );
  const [currency, setCurrency] = useState<TaskCurrency>(initial?.currency ?? "TRY");
  const [paymentDue, setPaymentDue] = useState(initial?.payment_due ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [factoryEdits, setFactoryEdits] = useState<Record<string, string>>({});
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractPath, setContractPath] = useState(initial?.contract_path ?? null);
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWarranty = plan === "warranty";
  const showWarranty = isWarranty || addWarranty;
  const count = visitsForPlan(plan, perYear);

  // Visit dates. New/draft: spread over the period and re-spread when the
  // inputs that define the spread change (a draft keeps its saved dates until
  // then). Live: only the not-yet-done visits can move, keyed by visit id.
  const [dates, setDates] = useState<string[]>(
    initial && mode === "draft" ? initial.visits.map((v) => v.due_date) : []
  );
  const [liveDates, setLiveDates] = useState<Record<string, string>>(
    Object.fromEntries((initial?.visits ?? []).map((v) => [v.id, v.due_date]))
  );
  // A draft keeps its saved dates until the inputs that define the spread
  // differ from what it was saved with. Compared by value, not a "first run"
  // flag, so React strict mode re-running effects on mount can't wipe them.
  const savedSpread = useRef(
    mode === "draft" && (initial?.visits.length ?? 0) > 0
      ? `${initial!.start_date}|${initial!.end_date}|${initial!.visits.length}`
      : null
  );
  useEffect(() => {
    if (live) return;
    if (savedSpread.current === `${start}|${end}|${count}`) return;
    setDates(spreadVisitDates(start, end, count));
  }, [live, start, end, count]);

  // Keep the end date a year after the start while the user hasn't typed one.
  const endTouched = useRef(!!initial);
  function changeStart(v: string) {
    setStart(v);
    if (!endTouched.current && v) setEnd(defaultEndDate(v));
  }

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const customerMachines = useMemo(
    () => machines.filter((m) => m.customer_id === customerId),
    [machines, customerId]
  );
  const selectedMachines = customerMachines.filter((m) => machineIds.includes(m.id));

  function factoryOf(m: FormMachine): string {
    return factoryEdits[m.id] ?? m.warranty_end ?? "";
  }
  const factoryEnd =
    selectedMachines.map(factoryOf).filter(Boolean).sort().at(-1) ?? null;

  // Warranty end follows factory end + months until the user types a date.
  useEffect(() => {
    if (!showWarranty || warrantyTouched || !start) return;
    setWarrantyEnd(warrantyEndFrom(factoryEnd, start, months));
  }, [showWarranty, warrantyTouched, factoryEnd, start, months]);

  function pickCustomer(id: string) {
    setCustomerId(id);
    setMachineIds([]);
    setFactoryEdits({});
  }

  function toggleMachine(id: string) {
    setMachineIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function toggleTech(id: string) {
    setTechIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function pickPlan(p: AgreementPlan) {
    setPlan(p);
    if (p === "warranty") setAddWarranty(true);
  }

  function pickContract(file: File | null) {
    if (!file) return setContractFile(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toastErr(t("ag.contractPdfOnly"));
      return;
    }
    if (file.size > MAX_CONTRACT) {
      toastErr(t("ag.contractTooBig"));
      return;
    }
    setContractFile(file);
  }

  async function openContract() {
    if (!initial) return;
    const res = await getContractUrl(initial.id);
    if (res.error || !("url" in res) || !res.url) return toastErr(res.error ?? "No contract.");
    window.open(res.url, "_blank", "noopener");
  }

  async function dropContract() {
    if (!initial) return;
    const res = await removeContract(initial.id);
    if (res.error) return toastErr(res.error);
    setContractPath(null);
  }

  const amount = parseAmount(price);

  async function submit(asDraft: boolean) {
    if (busy) return;
    setError(null);
    if (!customerId) return setError(t("ag.pickCustomer"));
    setBusy(asDraft ? "draft" : "save");

    try {
      const common = {
        start_date: start,
        end_date: end,
        machine_ids: machineIds,
        includes_warranty: showWarranty,
        warranty_end: showWarranty && warrantyEnd ? warrantyEnd : null,
        coverage: showWarranty ? coverage : null,
        warranty_months: showWarranty ? months : null,
        remind_days: remind,
        amount,
        currency,
        payment_due: paymentDue || null,
        technician_ids: techIds,
        notes,
      };

      let agreementId = initial?.id ?? "";
      if (live) {
        const res = await updateAgreement(initial!.id, {
          ...common,
          visit_dates: initial!.visits
            .filter((v) => !v.done_at && liveDates[v.id] && liveDates[v.id] !== v.due_date)
            .map((v) => ({ id: v.id, due_date: liveDates[v.id] })),
        });
        if (res.error) return setError(res.error);
      } else {
        const res = await saveAgreement(
          initial?.id ?? null,
          {
            ...common,
            customer_id: customerId,
            plan,
            visits_per_year: count,
            visit_dates: dates,
          },
          asDraft
        );
        if (res.error) return setError(res.error);
        agreementId = (res as { id: string }).id;
      }

      // Factory warranty dates typed on the machines.
      for (const m of selectedMachines) {
        const next = factoryEdits[m.id];
        if (next !== undefined && next !== (m.warranty_end ?? "")) {
          const r = await setMachineWarranty(m.id, next || null);
          if (r.error) toastErr(r.error);
        }
      }

      // The signed contract goes straight to private storage, then is recorded.
      if (contractFile) {
        const supabase = createClient();
        const safe = contractFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${agreementId}/${Date.now()}-${safe}`;
        const up = await supabase.storage
          .from("agreement-contracts")
          .upload(path, contractFile, { contentType: "application/pdf" });
        if (up.error) {
          toastErr(`${t("ag.contractUploadFailed")} ${up.error.message}`);
        } else {
          const r = await attachContract(agreementId, path);
          if (r.error) toastErr(r.error);
        }
      }

      toast(asDraft ? t("ag.draftSaved") : t("ag.saved"), "success");
      router.push("/agreements");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const planLabel = (p: AgreementPlan) => t(`ag.type.${p}` as const);
  const visitsTxt = `${count} ${count === 1 ? t("ag.visitAYear") : t("ag.visitsAYear")}`;
  const everyMonths = count > 1 ? Math.round((12 / count) * 10) / 10 : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/agreements" className="text-sm text-ink-muted hover:text-ink">
        ← {t("ag.back")}
      </Link>

      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-[28px]">
            {mode === "new" ? t("ag.new") : t("ag.editTitle")}
            {mode === "draft" && (
              <span className="tone-neutral ml-3 rounded-full px-2.5 py-0.5 align-middle text-xs font-medium">
                {t("ag.draft")}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{t("ag.newSubtitle")}</p>
        </div>
        <Actions
          mode={mode}
          busy={busy}
          onDraft={() => submit(true)}
          onSave={() => submit(false)}
          className="hidden md:flex"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* 1 · Customer & machines */}
          <Section n={1} title={t("ag.step1")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{t("ag.customer")}</label>
                <select
                  className="input"
                  value={customerId}
                  disabled={mode !== "new"}
                  onChange={(e) => pickCustomer(e.target.value)}
                >
                  <option value="">{t("ag.pickCustomer")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t("ag.contact")}</label>
                <input
                  className="input"
                  value={customer?.contact_person ?? ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="label">{t("ag.machines")}</label>
              {!customer ? (
                <p className="text-sm text-ink-faint">{t("ag.pickCustomerFirst")}</p>
              ) : customerMachines.length === 0 ? (
                <p className="text-sm text-ink-faint">{t("ag.noMachines")}</p>
              ) : (
                <div className="space-y-2">
                  {customerMachines.map((m) => {
                    const on = machineIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`rounded-xl border px-3.5 py-3 transition ${
                          on
                            ? "border-brand-400 bg-surface-soft"
                            : "border-surface-border bg-surface"
                        }`}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={on}
                            onChange={() => toggleMachine(m.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink">
                              {m.label}
                            </span>
                            {m.serial_number && (
                              <span className="block text-xs text-ink-muted">
                                SN {m.serial_number}
                              </span>
                            )}
                          </span>
                        </label>
                        {on && (
                          <div className="mt-3 pl-7">
                            <label className="label">{t("ag.factoryWarranty")}</label>
                            <input
                              type="date"
                              className="input sm:max-w-[220px]"
                              value={factoryOf(m)}
                              onChange={(e) =>
                                setFactoryEdits((cur) => ({ ...cur, [m.id]: e.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          {/* 2 · Agreement type */}
          <Section n={2} title={t("ag.step2")}>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLANS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={live}
                  onClick={() => pickPlan(p)}
                  className={`rounded-xl border px-3.5 py-3 text-left transition disabled:cursor-not-allowed ${
                    plan === p
                      ? "border-brand-400 bg-surface-soft ring-2 ring-brand-100"
                      : "border-surface-border bg-surface hover:bg-surface-soft"
                  } ${live && plan !== p ? "opacity-50" : ""}`}
                >
                  <span className="block text-sm font-semibold text-ink">{planLabel(p)}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {t(`ag.type.${p}Desc` as const)}
                  </span>
                </button>
              ))}
            </div>

            {plan === "periodic" && (
              <div className="mt-4">
                <label className="label">{t("ag.visitsPerYear")}</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-surface-border bg-surface">
                    <button
                      type="button"
                      className="icon-btn h-10 w-10 text-lg disabled:opacity-40"
                      disabled={live || perYear <= 1}
                      onClick={() => setPerYear((n) => Math.max(1, n - 1))}
                      aria-label="−"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums text-ink">
                      {perYear}
                    </span>
                    <button
                      type="button"
                      className="icon-btn h-10 w-10 text-lg disabled:opacity-40"
                      disabled={live || perYear >= 12}
                      onClick={() => setPerYear((n) => Math.min(12, n + 1))}
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm text-ink-muted">
                    {visitsTxt}
                    {everyMonths > 0 && ` · ~${everyMonths} ${t("ag.months")}`}
                  </span>
                </div>
                {!live && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {t("ag.quickPick")}
                    </span>
                    {PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPerYear(n)}
                        className={`rounded-full border px-3 py-1 text-sm transition ${
                          perYear === n
                            ? "border-brand-400 bg-surface-soft text-ink"
                            : "border-surface-border text-ink-muted hover:bg-surface-soft"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isWarranty && (
              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={addWarranty}
                  onChange={(e) => setAddWarranty(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{t("ag.addWarranty")}</span>
                  <span className="block text-xs text-ink-muted">{t("ag.warrantyHint")}</span>
                </span>
              </label>
            )}
          </Section>

          {/* Extended warranty */}
          {showWarranty && (
            <Section n="★" title={t("ag.stepWarranty")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">{t("ag.extension")}</label>
                  <select
                    className="input"
                    value={months}
                    onChange={(e) => {
                      setMonths(Number(e.target.value));
                      setWarrantyTouched(false);
                    }}
                  >
                    {[...new Set([...MONTH_OPTIONS, months])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        {m} {t("ag.months")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{t("ag.warrantyEnds")}</label>
                  <input
                    type="date"
                    className="input"
                    value={warrantyEnd}
                    onChange={(e) => {
                      setWarrantyEnd(e.target.value);
                      setWarrantyTouched(true);
                    }}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-faint">{t("ag.warrantyEndsHint")}</p>

              <div className="mt-4">
                <label className="label">{t("ag.coverage")}</label>
                <div className="seg flex-wrap">
                  {COVERAGES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`seg-btn ${coverage === c ? "seg-btn-on" : ""}`}
                      onClick={() => setCoverage(c)}
                    >
                      {t(`ag.cov.${c}` as const)}
                    </button>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* 3 · Schedule & team */}
          <Section n={3} title={t("ag.step3")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">{t("ag.start")}</label>
                <input
                  type="date"
                  className="input"
                  value={start}
                  onChange={(e) => changeStart(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t("ag.end")}</label>
                <input
                  type="date"
                  className="input"
                  value={end}
                  min={start}
                  onChange={(e) => {
                    endTouched.current = true;
                    setEnd(e.target.value);
                  }}
                />
              </div>
              {!isWarranty && (
                <div>
                  <label className="label">{t("ag.remind")}</label>
                  <select
                    className="input"
                    value={remind}
                    onChange={(e) => setRemind(Number(e.target.value) as RemindDays)}
                  >
                    {[3, 7, 14].map((d) => (
                      <option key={d} value={d}>
                        {d} {t("ag.days")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-5">
              <label className="label">{t("ag.technicians")}</label>
              <div className="flex flex-wrap gap-2">
                {technicians.map((p) => {
                  const idx = techIds.indexOf(p.id);
                  const on = idx >= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleTech(p.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                        on
                          ? "border-brand-400 bg-surface-soft text-ink"
                          : "border-surface-border text-ink-muted hover:bg-surface-soft"
                      }`}
                    >
                      {p.name}
                      {idx === 0 && (
                        <span className="tone-progress rounded-full px-1.5 text-[10px] font-semibold uppercase">
                          {t("ag.lead")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">{t("ag.technicianLead")}</p>
            </div>

            {!isWarranty && (
              <div className="mt-5">
                <label className="label">{t("ag.visitDates")}</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {live
                    ? initial!.visits.map((v, i) => (
                        <VisitDate
                          key={v.id}
                          n={i + 1}
                          label={t("ag.visit")}
                          value={liveDates[v.id] ?? v.due_date}
                          done={!!v.done_at}
                          onChange={(d) => setLiveDates((cur) => ({ ...cur, [v.id]: d }))}
                        />
                      ))
                    : dates.map((d, i) => (
                        <VisitDate
                          key={i}
                          n={i + 1}
                          label={t("ag.visit")}
                          value={d}
                          onChange={(val) =>
                            setDates((cur) => cur.map((x, j) => (j === i ? val : x)))
                          }
                        />
                      ))}
                </div>
              </div>
            )}
            {isWarranty && (
              <p className="mt-5 text-sm text-ink-muted">{t("ag.noVisits")}</p>
            )}
          </Section>

          {/* 4 · Payment */}
          <Section n={4} title={t("ag.step4")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label">{t("ag.price")}</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  value={price}
                  onChange={(e) => setPrice(sanitizeAmount(e.target.value))}
                />
              </div>
              <div>
                <label className="label">{t("ag.currency")}</label>
                <select
                  className="input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as TaskCurrency)}
                >
                  <option value="TRY">₺ TRY</option>
                  <option value="EUR">€ EUR</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>
              <div>
                <label className="label">{t("ag.paymentDue")}</label>
                <input
                  type="date"
                  className="input"
                  value={paymentDue}
                  onChange={(e) => setPaymentDue(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="label">{t("ag.notes")}</label>
              <textarea
                className="input min-h-[84px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="mt-4">
              <label className="label">{t("ag.contract")}</label>
              {contractPath && !contractFile && (
                <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-soft px-3.5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {contractPath.split("/").pop()?.replace(/^\d+-/, "")}
                  </span>
                  <button type="button" className="text-ink-muted hover:text-ink" onClick={openContract}>
                    {t("ag.openContract")}
                  </button>
                  <button type="button" className="text-red-500" onClick={dropContract}>
                    {t("ag.removeContract")}
                  </button>
                </div>
              )}
              <label className="btn-ghost cursor-pointer">
                {contractFile ? contractFile.name : t("ag.uploadContract")}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    pickContract(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="ml-3 text-xs text-ink-faint">
                {contractFile ? t("ag.contractPending") : t("ag.contractHint")}
              </span>
            </div>
          </Section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {t("ag.summary")}
            </h2>
            <p className="mt-3 text-base font-semibold text-ink">
              {customer?.name ?? "—"}
            </p>
            {selectedMachines.map((m) => (
              <p key={m.id} className="text-sm text-ink-muted">
                {m.label}
                {m.serial_number ? ` · SN ${m.serial_number}` : ""}
              </p>
            ))}
            <span
              className={`${PLAN_TONE[plan]} mt-3 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium`}
            >
              {planLabel(plan)}
              {plan === "periodic" ? ` · ${perYear}×` : ""}
            </span>

            {!isWarranty && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {t("ag.plannedVisits")} ({live ? initial!.visits.length : dates.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {(live
                    ? initial!.visits.map((v) => liveDates[v.id] ?? v.due_date)
                    : dates
                  ).map((d, i) => (
                    <li key={i} className="flex justify-between text-sm">
                      <span className="text-ink-muted">
                        {t("ag.visit")} {i + 1}
                      </span>
                      <span className="tabular-nums text-ink">{formatDate(d)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showWarranty && (
              <div className="mt-4 flex justify-between text-sm">
                <span className="text-ink-muted">{t("ag.coveredUntil")}</span>
                <span className="tabular-nums text-ink">
                  {warrantyEnd ? formatDate(warrantyEnd) : "—"}
                </span>
              </div>
            )}

            <div className="mt-4 flex justify-between border-t border-surface-border pt-4 text-sm">
              <span className="text-ink-muted">{t("ag.summaryPrice")}</span>
              <span className="font-semibold tabular-nums text-ink">
                {amount != null ? `${formatAmount(amount)} ${currency}` : "—"}
              </span>
            </div>

            <p className="mt-4 text-xs text-ink-faint">
              {mode === "draft" || mode === "new" ? t("ag.draftNote") : ""}{" "}
              {t("ag.savingNote")}
            </p>
          </div>
        </aside>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <Actions
        mode={mode}
        busy={busy}
        onDraft={() => submit(true)}
        onSave={() => submit(false)}
        className="mt-5 md:hidden"
      />
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number | string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-surface">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function VisitDate({
  n,
  label,
  value,
  done,
  onChange,
}: {
  n: number;
  label: string;
  value: string;
  done?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface px-3 py-2">
      <span className="w-20 shrink-0 text-sm text-ink-muted">
        {label} {n}
      </span>
      <input
        type="date"
        className="input !border-0 !bg-transparent !px-0 !py-1 focus:!ring-0"
        value={value}
        disabled={done}
        onChange={(e) => onChange(e.target.value)}
      />
      {done && <span className="tone-done rounded-full px-2 text-[10px] font-semibold">✓</span>}
    </label>
  );
}

function Actions({
  mode,
  busy,
  onDraft,
  onSave,
  className,
}: {
  mode: "new" | "draft" | "live";
  busy: "draft" | "save" | null;
  onDraft: () => void;
  onSave: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Link href="/agreements" className="btn-ghost">
        {t("common.cancel")}
      </Link>
      {mode !== "live" && (
        <button type="button" className="btn-ghost" disabled={!!busy} onClick={onDraft}>
          {busy === "draft" ? t("common.saving") : t("ag.saveDraft")}
        </button>
      )}
      <button type="button" className="btn-primary" disabled={!!busy} onClick={onSave}>
        {busy === "save"
          ? t("common.saving")
          : mode === "live"
            ? t("ag.saveChanges")
            : t("ag.save")}
      </button>
    </div>
  );
}
