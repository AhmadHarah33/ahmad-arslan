import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import { TASK_SELECT, normalizeTask } from "@/lib/tasks.server";
import { formatAmount } from "@/lib/money";
import { CURRENCY_SYMBOLS } from "@/lib/types";
import type { Customer, Task } from "@/lib/types";
import type { FieldDefinition } from "@/lib/customFields";
import PrintTrigger from "./print-trigger";
import QrCode from "@/components/qr-code";
import { customerQrValue } from "@/lib/qr";

const DEFAULT_COMPANY = {
  company_name: "Mars Med Dent",
  company_phone: "",
  company_address: "",
};

type PartRow = { id: string; quantity: number; unit_price: number | null; name: string };

export default async function TaskReport({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;

  let task: Task | null;
  let customer: Pick<Customer, "name"> | null = null;
  let defs: FieldDefinition[];
  let values: Record<string, unknown>;
  let company = DEFAULT_COMPANY;

  const supabase = createClient();
  const [{ data: t }, { data: settings }] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("id", id).single(),
    supabase.from("app_settings").select("*").eq("id", 1).single(),
  ]);
  task = t ? normalizeTask(t) : null;
  if (settings) company = settings as typeof DEFAULT_COMPANY;

  if (!task) {
    return <main className="p-10 text-center">Görev bulunamadı.</main>;
  }

  const [
    { data: c },
    { data: cityRow },
    { data: brandRow },
    { data: modelRow },
    { data: parts },
    loaded,
  ] = await Promise.all([
    task.customer_id
      ? supabase.from("customers").select("name").eq("id", task.customer_id).single()
      : Promise.resolve({ data: null }),
    task.city_id
      ? supabase.from("cities").select("name").eq("id", task.city_id).single()
      : Promise.resolve({ data: null }),
    task.company_id
      ? supabase.from("companies").select("name").eq("id", task.company_id).single()
      : Promise.resolve({ data: null }),
    task.model_id
      ? supabase.from("machine_models").select("name").eq("id", task.model_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("task_parts")
      .select("id, quantity, unit_price, part:spare_part_id(name)")
      .eq("task_id", id),
    loadFields("task", [id]),
  ]);
  customer = (c as any) ?? null;
  defs = loaded.defs;
  values = loaded.valueMap[id] ?? {};

  const partRows: PartRow[] = (parts ?? []).map((r: any) => ({
    id: r.id,
    quantity: r.quantity,
    unit_price: r.unit_price,
    name: r.part?.name ?? "Parça",
  }));
  const partsTotal = partRows.reduce((sum, r) => sum + (r.unit_price ?? 0) * r.quantity, 0);
  const grandTotal = partsTotal + (task.service_charge ?? 0);

  const leadEngineer = task.assignees.find((a) => a.is_lead) ?? task.assignees[0] ?? null;

  // Rapor is a file upload, not something to lay out on a printed page — the
  // task board already flags a missing one on the card.
  const textFields = defs.filter(
    (d) => d.field_type === "text" && d.label !== "Rapor" && values[d.id]
  );

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[#1f2430] print:p-0">
      <PrintTrigger />

      <header className="mb-6 flex items-start justify-between border-b-2 border-[#0284c7] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0284c7]">{company.company_name}</h1>
          {company.company_phone && <p className="text-sm">{company.company_phone}</p>}
          {company.company_address && <p className="text-sm">{company.company_address}</p>}
        </div>
        <div className="flex items-start gap-3 text-right text-sm">
          <div>
            <p className="font-semibold">Servis Raporu</p>
            <p>{new Date(task.created_at || Date.now()).toLocaleDateString("tr-TR")}</p>
          </div>
          {customer && (
            <div className="rounded bg-white p-1">
              <QrCode value={customerQrValue(customer.name)} size={72} />
            </div>
          )}
        </div>
      </header>

      <h2 className="mb-3 text-lg font-bold">{task.title}</h2>

      <table className="mb-5 w-full text-sm">
        <tbody>
          <Row
            label="Mühendis"
            value={leadEngineer ? leadEngineer.full_name || leadEngineer.first_name : "—"}
          />
          {task.assignees.length > 1 && (
            <Row
              label="Diğer görevliler"
              value={task.assignees
                .filter((a) => a.id !== leadEngineer?.id)
                .map((a) => a.full_name || a.first_name)
                .join(", ")}
            />
          )}
          {customer && <Row label="Müşteri" value={customer.name} />}
          {cityRow && <Row label="Şehir" value={(cityRow as any).name} />}
          {brandRow && <Row label="Marka" value={(brandRow as any).name} />}
          {modelRow && <Row label="Model" value={(modelRow as any).name} />}
        </tbody>
      </table>

      {task.description && (
        <Section title="Açıklama">
          <p className="whitespace-pre-wrap text-sm">{task.description}</p>
        </Section>
      )}

      {textFields.map((f) => (
        <Section key={f.id} title={f.label}>
          <p className="whitespace-pre-wrap text-sm">{String(values[f.id])}</p>
        </Section>
      ))}

      {partRows.length > 0 && (
        <Section title="Yedek parçalar">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500">
                <th className="py-1">Parça</th>
                <th className="py-1 text-right">Adet</th>
                <th className="py-1 text-right">Birim fiyat</th>
                <th className="py-1 text-right">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {partRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-1">{r.name}</td>
                  <td className="py-1 text-right">{r.quantity}</td>
                  <td className="py-1 text-right">
                    {CURRENCY_SYMBOLS[task.parts_currency]}{formatAmount(r.unit_price)}
                  </td>
                  <td className="py-1 text-right">
                    {CURRENCY_SYMBOLS[task.parts_currency]}
                    {formatAmount((r.unit_price ?? 0) * r.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <table className="mb-6 w-full text-sm">
        <tbody>
          {partsTotal > 0 && (
            <Row
              label="Parça toplamı"
              value={`${CURRENCY_SYMBOLS[task.parts_currency]}${formatAmount(partsTotal)}`}
              plain
            />
          )}
          {task.service_charge != null && (
            <Row
              label="Servis ücreti"
              value={`${CURRENCY_SYMBOLS[task.service_currency]}${formatAmount(task.service_charge)}`}
              plain
            />
          )}
          {(partsTotal > 0 || task.service_charge != null) && (
            <tr>
              <td className="w-32 py-1.5 pr-4 text-sm font-bold">Genel toplam</td>
              <td className="py-1.5 text-sm font-bold">
                {task.parts_currency === task.service_currency
                  ? `${CURRENCY_SYMBOLS[task.parts_currency]}${formatAmount(grandTotal)}`
                  : `${CURRENCY_SYMBOLS[task.parts_currency]}${formatAmount(partsTotal)} + ${CURRENCY_SYMBOLS[task.service_currency]}${formatAmount(task.service_charge ?? 0)}`}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-14 grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="mb-1 h-10 border-b border-gray-400" />
          <p className="text-xs text-gray-500">Mühendis imzası</p>
        </div>
        <div>
          <div className="mb-1 h-10 border-b border-gray-400" />
          <p className="text-xs text-gray-500">Müşteri imzası</p>
        </div>
      </div>

      <footer className="mt-10 border-t pt-3 text-xs text-gray-500">
        {company.company_name} tarafından oluşturuldu · Mars Technical Support
      </footer>
    </main>
  );
}

function Row({ label, value, plain = false }: { label: string; value: string; plain?: boolean }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="w-32 py-1.5 pr-4 font-medium text-gray-500">{label}</td>
      <td className={`py-1.5 ${plain ? "" : "capitalize"}`}>{value}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      {children}
    </div>
  );
}
