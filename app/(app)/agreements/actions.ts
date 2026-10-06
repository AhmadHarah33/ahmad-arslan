"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isIsoDate,
  spreadVisitDates,
  visitsForPlan,
} from "@/lib/agreements";
import type {
  AgreementPlan,
  RemindDays,
  TaskCurrency,
  WarrantyCoverage,
} from "@/lib/types";

// Same contract as every other server action here: resolve to { ok } or
// { error } instead of throwing, so useAction can surface it.

export type AgreementInput = {
  customer_id: string;
  plan: AgreementPlan;
  // Periodic only; annual is always 1, warranty-only 0.
  visits_per_year: number;
  start_date: string;
  end_date: string;
  machine_ids: string[];
  // One date per visit. Omit to spread them evenly over the period.
  visit_dates?: string[];
  // A warranty-only agreement is always an extension.
  includes_warranty: boolean;
  warranty_end: string | null;
  coverage: WarrantyCoverage | null;
  warranty_months: number | null;
  remind_days: RemindDays;
  amount: number | null;
  currency: TaskCurrency;
  payment_due: string | null;
  // The first technician is the lead.
  technician_ids: string[];
  notes: string;
};

// A live agreement keeps its plan and visit count (its visits and board tasks
// hang off them): to change either, cancel it and open a new one. Drafts are
// edited with saveAgreement instead, which rebuilds everything.
export type AgreementUpdate = Omit<
  AgreementInput,
  "customer_id" | "plan" | "visits_per_year" | "visit_dates"
> & {
  // Reschedule visits that are not done yet (a visit already on the board
  // moves its task's due date too).
  visit_dates?: { id: string; due_date: string }[];
};

const CURRENCIES = ["EUR", "USD", "TRY"];
const COVERAGES = ["parts_labour", "labour", "parts"];
const REMIND = [3, 7, 14];

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function refresh() {
  revalidatePath("/agreements");
  revalidatePath("/customers");
  revalidatePath("/tasks");
  revalidatePath("/");
}

// Checks shared by every save. A draft only needs enough to exist (a customer
// and sane dates); going live needs the rest. Returns an error or null.
function validate(
  i: Pick<
    AgreementInput,
    | "plan"
    | "start_date"
    | "end_date"
    | "includes_warranty"
    | "warranty_end"
    | "coverage"
    | "warranty_months"
    | "remind_days"
    | "amount"
    | "currency"
    | "payment_due"
    | "machine_ids"
  >,
  draft: boolean
): string | null {
  if (!isIsoDate(i.start_date) || !isIsoDate(i.end_date))
    return "Start and end dates are required.";
  if (i.end_date < i.start_date) return "End date can't be before the start date.";
  if (i.coverage !== null && !COVERAGES.includes(i.coverage))
    return "Unknown coverage.";
  if (
    i.warranty_months !== null &&
    !(Number.isInteger(i.warranty_months) && i.warranty_months >= 1 && i.warranty_months <= 120)
  )
    return "Extension period must be 1-120 months.";
  if (!REMIND.includes(i.remind_days)) return "Remind lead time must be 3, 7 or 14 days.";
  if (i.payment_due !== null && !isIsoDate(i.payment_due))
    return "Payment due date is invalid.";
  if (i.amount !== null && !(Number.isFinite(i.amount) && i.amount >= 0))
    return "Amount must be zero or more.";
  if (!CURRENCIES.includes(i.currency)) return "Unknown currency.";
  if (i.warranty_end !== null && !isIsoDate(i.warranty_end))
    return "Warranty end date is invalid.";
  if (draft) return null;

  if (i.machine_ids.length === 0) return "Pick at least one machine.";
  const extends_ = i.includes_warranty || i.plan === "warranty";
  if (extends_) {
    if (!i.warranty_end) return "Set the extended warranty end date.";
    if (i.warranty_end < i.start_date)
      return "Warranty can't end before the agreement starts.";
  }
  return null;
}

// Every machine must belong to the agreement's customer.
async function machinesBelongTo(customerId: string, machineIds: string[]) {
  if (machineIds.length === 0) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_machines")
    .select("id")
    .eq("customer_id", customerId)
    .in("id", machineIds);
  if (error) return error.message;
  if ((data ?? []).length !== new Set(machineIds).size)
    return "One of the machines doesn't belong to this customer.";
  return null;
}

// Replace an agreement's covered machines and technicians with the given sets.
async function syncLinks(id: string, machineIds: string[], technicianIds: string[]) {
  const supabase = createClient();
  const wantM = [...new Set(machineIds)];
  const wantT = [...new Set(technicianIds)];

  const [{ data: mRows }, { data: tRows }] = await Promise.all([
    supabase.from("agreement_machines").select("machine_id").eq("agreement_id", id),
    supabase.from("agreement_assignees").select("profile_id").eq("agreement_id", id),
  ]);
  const haveM = new Set((mRows ?? []).map((r) => r.machine_id as string));
  const haveT = new Set((tRows ?? []).map((r) => r.profile_id as string));

  const steps = [
    wantM.filter((m) => !haveM.has(m)).length &&
      supabase.from("agreement_machines").insert(
        wantM.filter((m) => !haveM.has(m)).map((machine_id) => ({ agreement_id: id, machine_id }))
      ),
    [...haveM].filter((m) => !wantM.includes(m)).length &&
      supabase.from("agreement_machines").delete().eq("agreement_id", id)
        .in("machine_id", [...haveM].filter((m) => !wantM.includes(m))),
    wantT.filter((p) => !haveT.has(p)).length &&
      supabase.from("agreement_assignees").insert(
        wantT.filter((p) => !haveT.has(p)).map((profile_id) => ({ agreement_id: id, profile_id }))
      ),
    [...haveT].filter((p) => !wantT.includes(p)).length &&
      supabase.from("agreement_assignees").delete().eq("agreement_id", id)
        .in("profile_id", [...haveT].filter((p) => !wantT.includes(p))),
  ];
  for (const s of steps) {
    if (!s) continue;
    const { error } = await s;
    if (error) return error.message;
  }
  return null;
}

// Visit dates for a plan: the ones given (sorted), else spread over the period.
function visitDatesFor(input: AgreementInput, count: number): string[] | string {
  const dates = input.visit_dates ?? spreadVisitDates(input.start_date, input.end_date, count);
  if (dates.length !== count || !dates.every(isIsoDate))
    return `Give exactly ${count} valid visit date(s).`;
  return [...dates].sort();
}

function agreementRow(input: AgreementInput, perYear: number, status: "draft" | "active") {
  const extension = input.includes_warranty || input.plan === "warranty";
  return {
    customer_id: input.customer_id,
    plan: input.plan,
    visits_per_year: perYear,
    start_date: input.start_date,
    end_date: input.end_date,
    includes_warranty: extension,
    warranty_end: extension ? input.warranty_end : null,
    coverage: extension ? input.coverage : null,
    warranty_months: extension ? input.warranty_months : null,
    remind_days: input.remind_days,
    amount: input.amount,
    currency: input.currency,
    payment_due: input.payment_due,
    assignee_id: input.technician_ids[0] ?? null,
    notes: input.notes.trim(),
    status,
  };
}

// Create a new agreement, or rebuild an existing DRAFT from scratch.
//   draft = true   saves it as a draft: visits are stored (so edited dates are
//                  kept) but no board tasks are created
//   draft = false  makes it live; due visits reach the board right away
// A live agreement can't be passed here (use updateAgreement).
export async function saveAgreement(
  id: string | null,
  input: AgreementInput,
  draft: boolean
) {
  const supabase = createClient();
  const uid = await currentUserId();

  if (!["periodic", "annual", "warranty"].includes(input.plan))
    return { error: "Pick an agreement type." };
  if (!input.customer_id) return { error: "Pick a customer." };
  const perYear = visitsForPlan(input.plan, input.visits_per_year);

  const bad = validate(input, draft);
  if (bad) return { error: bad };
  const badMachines = await machinesBelongTo(input.customer_id, input.machine_ids);
  if (badMachines) return { error: badMachines };

  const dates = visitDatesFor(input, perYear);
  if (typeof dates === "string") return { error: dates };

  const status = draft ? "draft" : "active";
  let agreementId = id;

  if (id) {
    const { data: current, error: cErr } = await supabase
      .from("agreements")
      .select("status")
      .eq("id", id)
      .single();
    if (cErr) return { error: cErr.message };
    if (current.status !== "draft")
      return { error: "Only a draft can be rebuilt. Edit a live agreement instead." };

    const { error } = await supabase
      .from("agreements")
      .update(agreementRow(input, perYear, status))
      .eq("id", id);
    if (error) return { error: error.message };

    // Drafts have no board tasks, so their visits can simply be replaced.
    const { error: dErr } = await supabase.from("agreement_visits").delete().eq("agreement_id", id);
    if (dErr) return { error: dErr.message };
  } else {
    const { data: created, error } = await supabase
      .from("agreements")
      .insert({ ...agreementRow(input, perYear, status), created_by: uid })
      .select("id")
      .single();
    if (error) return { error: error.message };
    agreementId = created.id as string;
  }

  // No transaction across these calls, so a failure on a NEW agreement deletes
  // it (everything cascades) instead of leaving it half-built.
  const rollback = async (message: string) => {
    if (!id) await supabase.from("agreements").delete().eq("id", agreementId!);
    return { error: message };
  };

  const linkErr = await syncLinks(agreementId!, input.machine_ids, input.technician_ids);
  if (linkErr) return rollback(linkErr);

  if (dates.length > 0) {
    const { error: vErr } = await supabase.from("agreement_visits").insert(
      dates.map((due_date, i) => ({ agreement_id: agreementId!, seq: i + 1, due_date }))
    );
    if (vErr) return rollback(vErr.message);
  }

  // A visit that is already due should reach the board right away rather than
  // wait for the next page load. Best-effort: pages run it too.
  if (!draft) await supabase.rpc("generate_due_agreement_visits");

  refresh();
  return { ok: true, id: agreementId! };
}

// Edit a LIVE (active or ended) agreement. Plan and visit count stay as they are.
export async function updateAgreement(id: string, input: AgreementUpdate) {
  const supabase = createClient();

  const { data: current, error: cErr } = await supabase
    .from("agreements")
    .select("customer_id, status, plan")
    .eq("id", id)
    .single();
  if (cErr) return { error: cErr.message };
  if (current.status === "cancelled")
    return { error: "A cancelled agreement can't be edited." };
  if (current.status === "draft")
    return { error: "A draft is edited by saving it again." };

  const bad = validate({ ...input, plan: current.plan }, false);
  if (bad) return { error: bad };
  const badMachines = await machinesBelongTo(current.customer_id, input.machine_ids);
  if (badMachines) return { error: badMachines };

  const moves = input.visit_dates ?? [];
  if (!moves.every((v) => isIsoDate(v.due_date)))
    return { error: "A visit date is invalid." };

  const extension = input.includes_warranty || current.plan === "warranty";
  const { error } = await supabase
    .from("agreements")
    .update({
      start_date: input.start_date,
      end_date: input.end_date,
      includes_warranty: extension,
      warranty_end: extension ? input.warranty_end : null,
      coverage: extension ? input.coverage : null,
      warranty_months: extension ? input.warranty_months : null,
      remind_days: input.remind_days,
      amount: input.amount,
      currency: input.currency,
      payment_due: input.payment_due,
      assignee_id: input.technician_ids[0] ?? null,
      notes: input.notes.trim(),
      // Extending the end date of a finished agreement brings it back.
      ...(current.status === "ended" && input.end_date >= today()
        ? { status: "active" }
        : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  const linkErr = await syncLinks(id, input.machine_ids, input.technician_ids);
  if (linkErr) return { error: linkErr };

  // Reschedule visits that aren't done yet.
  for (const v of moves) {
    const { data: visit, error: e } = await supabase
      .from("agreement_visits")
      .update({ due_date: v.due_date })
      .eq("id", v.id)
      .eq("agreement_id", id)
      .is("done_at", null)
      .select("task_id")
      .maybeSingle();
    if (e) return { error: e.message };
    if (visit?.task_id) {
      await supabase.from("tasks").update({ due_date: v.due_date }).eq("id", visit.task_id);
    }
  }

  await supabase.rpc("generate_due_agreement_visits");
  refresh();
  return { ok: true };
}

// Visits that never reached the board are removed; visits already on the board
// (or done) stay so the history and their tasks aren't orphaned. A draft is
// simply deleted.
export async function cancelAgreement(id: string) {
  const supabase = createClient();
  const { data: current, error: cErr } = await supabase
    .from("agreements")
    .select("status")
    .eq("id", id)
    .single();
  if (cErr) return { error: cErr.message };

  if (current.status === "draft") {
    const { error } = await supabase.from("agreements").delete().eq("id", id);
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  }
  if (current.status === "cancelled") return { ok: true };

  const { error } = await supabase
    .from("agreements")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };

  const { error: vErr } = await supabase
    .from("agreement_visits")
    .delete()
    .eq("agreement_id", id)
    .is("done_at", null)
    .is("task_id", null);
  if (vErr) return { error: vErr.message };

  refresh();
  return { ok: true };
}

export async function setPaymentStatus(id: string, paid: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("agreements")
    .update({
      payment_status: paid ? "paid" : "unpaid",
      paid_at: paid ? today() : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// The signed contract. The browser uploads the PDF straight to the private
// agreement-contracts bucket under "<agreement id>/…", then calls this to
// record it (and delete the file it replaces).
export async function attachContract(id: string, path: string) {
  if (!path.startsWith(`${id}/`) || !path.toLowerCase().endsWith(".pdf"))
    return { error: "Unexpected contract file." };
  const supabase = createClient();
  const { data: prev } = await supabase
    .from("agreements")
    .select("contract_path")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("agreements")
    .update({ contract_path: path })
    .eq("id", id);
  if (error) return { error: error.message };
  if (prev?.contract_path && prev.contract_path !== path) {
    await supabase.storage.from("agreement-contracts").remove([prev.contract_path]);
  }
  refresh();
  return { ok: true };
}

export async function removeContract(id: string) {
  const supabase = createClient();
  const { data: prev } = await supabase
    .from("agreements")
    .select("contract_path")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("agreements")
    .update({ contract_path: null })
    .eq("id", id);
  if (error) return { error: error.message };
  if (prev?.contract_path) {
    await supabase.storage.from("agreement-contracts").remove([prev.contract_path]);
  }
  refresh();
  return { ok: true };
}

// Short-lived link to open the private contract.
export async function getContractUrl(id: string) {
  const supabase = createClient();
  const { data: a, error } = await supabase
    .from("agreements")
    .select("contract_path")
    .eq("id", id)
    .single();
  if (error || !a?.contract_path) return { error: "No contract on file." };
  const { data, error: sErr } = await supabase.storage
    .from("agreement-contracts")
    .createSignedUrl(a.contract_path, 300);
  if (sErr) return { error: sErr.message };
  return { ok: true, url: data.signedUrl };
}

// "Send reminder" never contacts the customer: it puts a follow-up task on the
// board for the team (assigned to the agreement's lead, else whoever pressed
// the button). Pressing it twice doesn't pile up duplicates.
export async function sendReminder(
  id: string,
  kind: "payment" | "renewal" | "visit"
) {
  const supabase = createClient();
  const uid = await currentUserId();

  const { data: a, error } = await supabase
    .from("agreement_overview")
    .select(
      "id, customer_id, customer_name, assignee_id, amount, currency, payment_due, end_date, next_visit"
    )
    .eq("id", id)
    .single();
  if (error) return { error: error.message };

  const label = {
    payment: "payment",
    renewal: "agreement renewal",
    visit: "overdue maintenance visit",
  }[kind];
  const title = `Remind ${a.customer_name}: ${label}`;

  const { data: open } = await supabase
    .from("tasks")
    .select("id")
    .eq("customer_id", a.customer_id)
    .eq("title", title)
    .neq("status", "done")
    .limit(1);
  if (open && open.length > 0)
    return { error: "A reminder for this is already on the board." };

  const detail = {
    payment: `Payment${a.amount != null ? ` of ${a.amount} ${a.currency}` : ""} is unpaid${
      a.payment_due ? ` (due ${a.payment_due})` : ""
    }.`,
    renewal: `The agreement ends on ${a.end_date}. Ask whether they want to renew.`,
    visit: `A maintenance visit${a.next_visit ? ` due ${a.next_visit}` : ""} hasn't been done.`,
  }[kind];

  const { data: task, error: tErr } = await supabase
    .from("tasks")
    .insert({
      title,
      description: `Contact the customer. ${detail}`,
      status: "todo",
      priority: kind === "renewal" ? "medium" : "high",
      customer_id: a.customer_id,
      due_date: today(),
      position: Date.now(),
      created_by: uid,
    })
    .select("id")
    .single();
  if (tErr) return { error: tErr.message };

  const assignee = a.assignee_id ?? uid;
  if (assignee) {
    await supabase
      .from("task_assignees")
      .insert({ task_id: task.id, profile_id: assignee });
  }

  refresh();
  return { ok: true, task_id: task.id as string };
}

// Creates board tasks for visits that have come within their lead time. The
// pages call this on load (replaces generate_due_maintenance).
export async function generateAgreementVisits() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_due_agreement_visits");
  if (error) return { error: error.message };
  if (typeof data === "number" && data > 0) {
    revalidatePath("/tasks");
    revalidatePath("/agreements");
  }
  return { ok: true, created: (data as number) ?? 0 };
}

// Standard (factory) warranty for one machine. Goes through the machine
// approval gate like any other machine edit (non-approvers land pending review).
export async function setMachineWarranty(
  machineId: string,
  warrantyEnd: string | null
) {
  if (warrantyEnd !== null && !isIsoDate(warrantyEnd))
    return { error: "Warranty date is invalid." };
  const supabase = createClient();
  const { error } = await supabase
    .from("customer_machines")
    .update({ warranty_end: warrantyEnd })
    .eq("id", machineId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
