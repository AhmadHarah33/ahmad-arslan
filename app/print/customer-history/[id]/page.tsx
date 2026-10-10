import { createClient } from "@/lib/supabase/server";
import { OrbitoMark } from "@/components/orbito-mark";
import { loadFields } from "@/lib/fields.server";
import { TASK_SELECT, normalizeTask } from "@/lib/tasks.server";
import { formatDate } from "@/lib/dates";
import type { Customer } from "@/lib/types";

const DEFAULT_COMPANY = { company_name: "Mars Med Dent", company_phone: "", company_address: "" };

const TEXT = {
  tr: {
    title: "Servis Geçmişi",
    customer: "Müşteri",
    contact: "İletişim",
    machines: "Makineler",
    generated: "Oluşturulma",
    total: "Tamamlanan görev",
    symptom: "Arıza",
    diagnosis: "Teşhis",
    solution: "Çözüm",
    date: "Tarih",
    engineer: "Mühendis",
    empty: "Bu müşteri için tamamlanmış görev yok.",
    notFound: "Müşteri bulunamadı.",
  },
  en: {
    title: "Service History",
    customer: "Customer",
    contact: "Contact",
    machines: "Machines",
    generated: "Generated",
    total: "Completed tasks",
    symptom: "Symptom",
    diagnosis: "Diagnosis",
    solution: "Solution",
    date: "Date",
    engineer: "Engineer",
    empty: "No completed tasks for this customer.",
    notFound: "Customer not found.",
  },
} as const;

type MachineRow = {
  id: string;
  serial_number: string;
  city: { name: string } | null;
  company: { name: string } | null;
  model: { name: string } | null;
};

export default async function CustomerHistory({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}) {
  const L = TEXT[searchParams.lang === "en" ? "en" : "tr"];
  const supabase = createClient();

  const [{ data: c }, { data: settings }, { data: machines }, { data: rawTasks }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", params.id).single(),
      supabase.from("app_settings").select("*").eq("id", 1).single(),
      supabase
        .from("customer_machines")
        .select(
          "id, serial_number, city:city_id(name), company:company_id(name), model:model_id(name)"
        )
        .eq("customer_id", params.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("customer_id", params.id)
        .eq("status", "done"),
    ]);

  const customer = c as Customer | null;
  if (!customer) return <main className="p-10 text-center">{L.notFound}</main>;
  const company = (settings as typeof DEFAULT_COMPANY | null) ?? DEFAULT_COMPANY;

  // Newest completion first; a done task without completed_at falls back to
  // its creation date.
  const tasks = (rawTasks ?? [])
    .map(normalizeTask)
    .map((t) => ({ t, when: t.completed_at || t.created_at }))
    .sort((a, b) => (a.when < b.when ? 1 : -1));

  const { defs, valueMap } = await loadFields(
    "task",
    tasks.map(({ t }) => t.id)
  );
  const diagnosisId = defs.find((d) => d.label === "TEŞHİS")?.id;
  const solutionId = defs.find((d) => d.label === "ÇÖZÜM")?.id;
  const text = (taskId: string, fieldId: string | undefined) => {
    const v = fieldId ? valueMap[taskId]?.[fieldId] : null;
    return typeof v === "string" && v.trim() ? v : "—";
  };

  const machineLines = ((machines ?? []) as unknown as MachineRow[])
    .map((m) =>
      [m.company?.name, m.model?.name, m.serial_number && `S/N ${m.serial_number}`, m.city?.name]
        .filter(Boolean)
        .join(" · ")
    )
    .filter(Boolean);

  const today = new Date().toISOString().slice(0, 10);
  const contact = [customer.contact_person, customer.contact_info].filter(Boolean).join(" · ");

  return (
    <main className="bg-white text-[#1f2430]">
      <header className="mb-5 flex items-start justify-between border-b-2 border-[#E07B00] pb-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#1A1A1A]">
            <OrbitoMark size={28} ink />
            {company.company_name}
          </h1>
          {company.company_phone && <p className="text-sm">{company.company_phone}</p>}
          {company.company_address && <p className="text-sm">{company.company_address}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="text-lg font-semibold">{L.title}</p>
          <p>
            {L.generated}: {formatDate(today)}
          </p>
          <p>
            {L.total}: {tasks.length}
          </p>
        </div>
      </header>

      <table className="mb-5 w-full text-sm">
        <tbody>
          <InfoRow label={L.customer} value={customer.name} bold />
          {contact && <InfoRow label={L.contact} value={contact} />}
          {machineLines.length > 0 && <InfoRow label={L.machines} value={machineLines.join("\n")} />}
        </tbody>
      </table>

      {tasks.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">{L.empty}</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-[10.5px] leading-snug">
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          {/* thead repeats on every printed page */}
          <thead className="table-header-group">
            <tr className="bg-[#1A1A1A] text-left text-white">
              {[L.symptom, L.diagnosis, L.solution, L.date, L.engineer].map((h) => (
                <th key={h} className="border border-[#E07B00] px-1.5 py-1 text-[10.5px] font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map(({ t, when }, i) => (
              <tr
                key={t.id}
                className={i % 2 ? "bg-gray-50" : ""}
                style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
              >
                <Cell>{t.title}</Cell>
                <Cell>{text(t.id, diagnosisId)}</Cell>
                <Cell>{text(t.id, solutionId)}</Cell>
                <Cell nowrap>{formatDate(when)}</Cell>
                <Cell>
                  {t.assignees.length
                    ? t.assignees.map((a) => a.full_name || a.first_name).join(", ")
                    : "—"}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function Cell({ children, nowrap = false }: { children: React.ReactNode; nowrap?: boolean }) {
  return (
    <td
      className={`border border-gray-300 px-1.5 py-1 align-top ${
        nowrap ? "whitespace-nowrap" : "whitespace-pre-wrap break-words"
      }`}
    >
      {children}
    </td>
  );
}

function InfoRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="w-28 py-1.5 pr-4 align-top font-medium text-gray-500">{label}</td>
      <td className={`whitespace-pre-line py-1.5 ${bold ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}
