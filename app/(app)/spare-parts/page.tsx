import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SparePartsView from "@/components/spare-parts/spare-parts-view";
import type { Company, SparePart } from "@/lib/types";

export default async function SparePartsPage({
  searchParams,
}: {
  searchParams: { q?: string; brand?: string };
}) {
  const profile = await requireProfile();
  const initialQuery = searchParams.q ?? "";
  const brandFilter = searchParams.brand ?? "";

  const supabase = createClient();

  let partsQuery = supabase
    .from("spare_parts")
    .select("*, spare_part_photos(*), company:company_id(id, name)")
    .order("name");
  if (brandFilter) partsQuery = partsQuery.eq("company_id", brandFilter);

  const [{ data: companies }, { data: parts }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    partsQuery,
  ]);

  return (
    <SparePartsView
      profile={profile}
      companies={(companies ?? []) as Company[]}
      parts={(parts ?? []) as SparePart[]}
      brandFilter={brandFilter}
      initialQuery={initialQuery}
    />
  );
}
