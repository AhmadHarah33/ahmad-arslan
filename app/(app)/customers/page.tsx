import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadExpiringWarranties } from "@/lib/agreements.server";
import CustomersView from "@/components/customers/customers-view";
import type { City, Company, Customer, MachineModel } from "@/lib/types";

export default async function CustomersPage({
  searchParams: searchPromise,
}: {
  searchParams: Promise<{ q?: string; brand?: string }>;
}) {
  const searchParams = await searchPromise;
  const profile = await requireProfile();
  const initialQuery = searchParams.q ?? "";
  const brandFilter = searchParams.brand ?? "";

  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*, customer_links(*), customer_machines(*), company:company_id(id, name)")
    .order("name");
  if (brandFilter === "__none__") query = query.is("company_id", null);
  else if (brandFilter) query = query.eq("company_id", brandFilter);

  const [
    { data },
    { data: companiesData },
    { data: citiesData },
    { data: modelsData },
    { data: brandRows },
  ] =
    await Promise.all([
      query,
      supabase.from("companies").select("*").order("name"),
      supabase.from("cities").select("*").order("name"),
      supabase.from("machine_models").select("*").order("name"),
      // Unfiltered, so the brand tabs can show a count for every brand.
      supabase.from("customers").select("company_id"),
    ]);

  const customers = (data ?? []) as Customer[];
  const companies = (companiesData ?? []) as Company[];
  const cities = (citiesData ?? []) as City[];
  const models = (modelsData ?? []) as MachineModel[];
  const expiringWarranties = await loadExpiringWarranties(supabase);
  const brandCounts: Record<string, number> = {};
  for (const r of (brandRows ?? []) as { company_id: string | null }[]) {
    const k = r.company_id ?? "__none__";
    brandCounts[k] = (brandCounts[k] ?? 0) + 1;
  }

  return (
    <CustomersView
      profile={profile}
      initialCustomers={customers}
      companies={companies}
      cities={cities}
      models={models}
      brandFilter={brandFilter}
      expiringWarranties={expiringWarranties}
      brandCounts={brandCounts}
      initialQuery={initialQuery}
    />
  );
}
