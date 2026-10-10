import { createClient } from "@/lib/supabase/server";
import { OrbitoMark } from "@/components/orbito-mark";
import { formatAmount } from "@/lib/money";
import { CURRENCY_SYMBOLS } from "@/lib/types";
import type { Agreement } from "@/lib/types";
import QrCode from "@/components/qr-code";
import { customerQrValue } from "@/lib/qr";
import { formatDate } from "@/lib/dates";

const DEFAULT_COMPANY = {
  company_name: "Mars Med Dent",
  company_phone: "",
  company_address: "",
};

const PLAN: Record<string, string> = {
  periodic: "Periyodik bakım",
  annual: "Yıllık bakım",
  warranty: "Garanti uzatma",
};
const COVERAGE: Record<string, string> = {
  parts_labour: "Parça + işçilik",
  labour: "Yalnızca işçilik",
  parts: "Yalnızca parça",
};
const STATUS: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  ended: "Sona erdi",
  cancelled: "İptal",
};

// Dates are plain days: format them in UTC so they never shift with a timezone.
const date = (d: string | null | undefined) => (d ? formatDate(d) : "—");

// PostgREST returns a joined row as an object or a one-element array.
function first(v: any): any {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export default async function AgreementPrint({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: a }, { data: settings }] = await Promise.all([
    supabase.from("agreements").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("app_settings").select("*").eq("id", 1).single(),
  ]);
  if (!a) return <main className="p-10 text-center">Sözleşme bulunamadı.</main>;
  const ag = a as Agreement;
  const company = (settings as typeof DEFAULT_COMPANY | null) ?? DEFAULT_COMPANY;

  const [{ data: cust }, { data: ms }, { data: ts }, { data: vs }] = await Promise.all([
    supabase.from("customers").select("name, contact_person").eq("id", ag.customer_id).single(),
    supabase
      .from("agreement_machines")
      .select(
        "machine:machine_id(serial_number, warranty_end, company:company_id(name), model:model_id(name))"
      )
      .eq("agreement_id", ag.id),
    supabase
      .from("agreement_assignees")
      .select("profile:profile_id(full_name, first_name)")
      .eq("agreement_id", ag.id),
    supabase
      .from("agreement_visits")
      .select("seq, due_date, done_at")
      .eq("agreement_id", ag.id)
      .order("seq"),
  ]);

  const machines = (ms ?? []).map((r: any) => {
    const m = first(r.machine);
    return {
      name: [first(m?.company)?.name, first(m?.model)?.name].filter(Boolean).join(" ") || "—",
      serial: (m?.serial_number as string) || "—",
      warranty: (m?.warranty_end as string | null) ?? null,
    };
  });
  const techs = (ts ?? [])
    .map((r: any) => first(r.profile))
    .map((p: any) => p?.full_name || p?.first_name)
    .filter(Boolean) as string[];
  const visits = (vs ?? []) as { seq: number; due_date: string; done_at: string | null }[];
  const customer = cust as { name: string; contact_person: string | null } | null;
  const extension = ag.includes_warranty || ag.plan === "warranty";
  const sym = CURRENCY_SYMBOLS[ag.currency];

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[#1f2430] print:p-0">
      <header className="mb-6 flex items-start justify-between border-b-2 border-[#E07B00] pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#1A1A1A]">
            <OrbitoMark size={28} ink />
            {company.company_name}
          </h1>
          {company.company_phone && <p className="text-sm">{company.company_phone}</p>}
          {company.company_address && <p className="text-sm">{company.company_address}</p>}
        </div>
        <div className="flex items-start gap-3 text-right text-sm">
          <div>
            <p className="font-semibold">Bakım &amp; Garanti Sözleşmesi</p>
            <p>{date(ag.created_at.slice(0, 10))}</p>
            <p className="text-gray-500">{STATUS[ag.status] ?? ag.status}</p>
          </div>
          {customer && (
            <div className="rounded bg-white p-1">
              <QrCode value={customerQrValue(customer.name)} size={72} />
            </div>
          )}
        </div>
      </header>

      <h2 className="mb-3 text-lg font-bold">{customer?.name ?? "—"}</h2>

      <table className="mb-5 w-full text-sm">
        <tbody>
          {customer?.contact_person && <Row label="Yetkili kişi" value={customer.contact_person} />}
          <Row label="Sözleşme türü" value={PLAN[ag.plan] ?? ag.plan} />
          <Row label="Başlangıç" value={date(ag.start_date)} />
          <Row label="Bitiş" value={date(ag.end_date)} />
          {ag.plan !== "warranty" && (
            <Row
              label="Yıllık ziyaret"
              value={ag.plan === "annual" ? "1" : String(ag.visits_per_year)}
            />
          )}
          {techs.length > 0 && <Row label="Teknisyenler" value={techs.join(", ")} />}
        </tbody>
      </table>

      <Section title="Kapsanan makineler">
        {machines.length === 0 ? (
          <p className="text-sm">—</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500">
                <th className="py-1">Makine</th>
                <th className="py-1">Seri no</th>
                <th className="py-1 text-right">Fabrika garantisi</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{m.name}</td>
                  <td className="py-1">{m.serial}</td>
                  <td className="py-1 text-right">{date(m.warranty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {extension && (
        <Section title="Uzatılmış garanti">
          <table className="w-full text-sm">
            <tbody>
              <Row label="Kapsam" value={ag.coverage ? COVERAGE[ag.coverage] ?? ag.coverage : "—"} />
              {ag.warranty_months != null && (
                <Row label="Süre" value={`${ag.warranty_months} ay`} />
              )}
              <Row label="Garanti bitişi" value={date(ag.warranty_end)} />
            </tbody>
          </table>
        </Section>
      )}

      {visits.length > 0 && (
        <Section title="Ziyaret planı">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500">
                <th className="py-1">Ziyaret</th>
                <th className="py-1">Planlanan tarih</th>
                <th className="py-1 text-right">Durum</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.seq} className="border-b border-gray-100">
                  <td className="py-1">{v.seq}</td>
                  <td className="py-1">{date(v.due_date)}</td>
                  <td className="py-1 text-right">
                    {v.done_at ? `Tamamlandı (${date(v.done_at)})` : "Bekliyor"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Ödeme">
        <table className="w-full text-sm">
          <tbody>
            <Row
              label="Sözleşme bedeli"
              value={ag.amount != null ? `${sym}${formatAmount(ag.amount)}` : "—"}
            />
            <Row label="Ödeme durumu" value={ag.payment_status === "paid" ? "Ödendi" : "Ödenmedi"} />
            {ag.payment_status === "paid" ? (
              <Row label="Ödeme tarihi" value={date(ag.paid_at)} />
            ) : (
              <Row label="Son ödeme tarihi" value={date(ag.payment_due)} />
            )}
          </tbody>
        </table>
      </Section>

      {ag.notes && (
        <Section title="Notlar">
          <p className="whitespace-pre-wrap text-sm">{ag.notes}</p>
        </Section>
      )}

      <div className="mt-14 grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="mb-1 h-10 border-b border-gray-400" />
          <p className="text-xs text-gray-500">{company.company_name} yetkilisi</p>
        </div>
        <div>
          <div className="mb-1 h-10 border-b border-gray-400" />
          <p className="text-xs text-gray-500">Müşteri imzası</p>
        </div>
      </div>

      <footer className="mt-10 border-t pt-3 text-xs text-gray-500">
        {company.company_name} tarafından oluşturuldu · Orbito
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="w-40 py-1.5 pr-4 font-medium text-gray-500">{label}</td>
      <td className="py-1.5">{value}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </div>
  );
}
