import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { photoUrl } from "@/lib/storage";
import { orderCode } from "@/lib/orders";

const DEFAULT_COMPANY = { company_name: "Mars Med Dent", company_phone: "", company_address: "" };

const TEXT = {
  tr: {
    title: "Sipariş Listesi",
    brand: "Marka",
    supplier: "Tedarikçi",
    notes: "Not",
    date: "Tarih",
    lines: "Kalem",
    pieces: "Toplam adet",
    photo: "Foto",
    partNumber: "Parça no",
    name: "Parça adı",
    qty: "Adet",
    notFound: "Sipariş listesi bulunamadı.",
  },
  en: {
    title: "Order List",
    brand: "Brand",
    supplier: "Supplier",
    notes: "Notes",
    date: "Date",
    lines: "Items",
    pieces: "Total pieces",
    photo: "Photo",
    partNumber: "Part number",
    name: "Part name",
    qty: "Qty",
    notFound: "Order list not found.",
  },
} as const;

type Item = {
  id: string;
  part_number: string;
  name: string;
  quantity: number;
  photo_path: string | null;
};

export default async function OrderListPrint({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}) {
  const L = TEXT[searchParams.lang === "en" ? "en" : "tr"];
  const supabase = createClient();

  const [{ data: order }, { data: settings }, { data: rawItems }] = await Promise.all([
    supabase.from("order_lists").select("*").eq("id", params.id).single(),
    supabase.from("app_settings").select("*").eq("id", 1).single(),
    supabase
      .from("order_list_items")
      .select("id, part_number, name, quantity, photo_path")
      .eq("order_list_id", params.id)
      .order("position"),
  ]);

  if (!order) return <main className="p-10 text-center">{L.notFound}</main>;
  const company = (settings as typeof DEFAULT_COMPANY | null) ?? DEFAULT_COMPANY;
  const items = (rawItems ?? []) as Item[];
  const pieces = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <main className="bg-white text-[#1f2430]">
      <header className="relative mb-5 flex items-start justify-between border-b-2 border-[#323490] pb-3">
        <span aria-hidden="true" className="absolute -bottom-[2px] left-0 h-[5px] w-14 bg-[#BED631] [print-color-adjust:exact]" />
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mars-med-dent-logo.webp"
            alt={company.company_name}
            className="mb-1.5 h-11 w-auto"
          />
          {company.company_phone && <p className="text-sm">{company.company_phone}</p>}
          {company.company_address && <p className="text-sm">{company.company_address}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="text-lg font-semibold">{L.title}</p>
          <p className="font-semibold">{orderCode(order.number)}</p>
          <p>
            {L.date}: {formatDate(order.created_at)}
          </p>
        </div>
      </header>

      <table className="mb-5 w-full text-sm">
        <tbody>
          <InfoRow label={L.brand} value={order.company_name || "—"} bold />
          {order.supplier && <InfoRow label={L.supplier} value={order.supplier} />}
          {order.notes && <InfoRow label={L.notes} value={order.notes} />}
          <InfoRow label={L.lines} value={`${items.length}  ·  ${L.pieces}: ${pieces}`} />
        </tbody>
      </table>

      <table className="w-full table-fixed border-collapse text-[12px] leading-snug">
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "48%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        {/* thead repeats on every printed page */}
        <thead className="table-header-group">
          <tr className="bg-[#323490] text-left text-white [print-color-adjust:exact]">
            {["#", L.photo, L.partNumber, L.name, L.qty].map((h, i) => (
              <th
                key={h}
                className={`border border-[#323490] px-2 py-1.5 font-semibold ${i === 4 ? "text-center" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr
              key={it.id}
              className={i % 2 ? "bg-gray-50" : ""}
              style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
            >
              <td className="border border-gray-300 px-2 py-1 text-center align-middle text-gray-500">
                {i + 1}
              </td>
              <td className="border border-gray-300 p-1 text-center align-middle">
                {it.photo_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl(it.photo_path)}
                    alt=""
                    className="mx-auto h-14 w-14 rounded object-cover"
                  />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="break-words border border-gray-300 px-2 py-1 align-middle font-semibold">
                {it.part_number || "—"}
              </td>
              <td className="whitespace-pre-wrap break-words border border-gray-300 px-2 py-1 align-middle">
                {it.name}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center align-middle text-[15px] font-bold">
                {it.quantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
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
