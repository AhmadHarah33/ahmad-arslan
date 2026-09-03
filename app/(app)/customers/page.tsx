import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import CustomersView from "@/components/customers/customers-view";
import type { Company, Customer } from "@/lib/types";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string; brand?: string };
}) {
  const profile = await requireProfile();
  const initialQuery = searchParams.q ?? "";
  const brandFilter = searchParams.brand ?? "";

  const supabase = createClient();

  let query = supabase
    .from("customers")
    .select("*, customer_links(*), company:company_id(id, name)")
    .order("name");
  if (brandFilter === "__none__") query = query.is("company_id", null);
  else if (brandFilter) query = query.eq("company_id", brandFilter);

  const [{ data }, { data: companiesData }] = await Promise.all([
    query,
    supabase.from("companies").select("*").order("name"),
  ]);

  const customers = (data ?? []) as Customer[];
  const companies = (companiesData ?? []) as Company[];
  const { defs, valueMap } = await loadFields(
    "customer",
    customers.map((c) => c.id)
  );

  return (
    <CustomersView
      profile={profile}
      initialCustomers={customers}
      companies={companies}
      brandFilter={brandFilter}
      fieldDefs={defs}
      fieldValues={valueMap}
      initialQuery={initialQuery}
    />
  );
}
