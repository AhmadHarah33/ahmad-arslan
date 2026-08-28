import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SparePartsView from "@/components/spare-parts/spare-parts-view";
import type { Company, SparePart } from "@/lib/types";
import { PREVIEW, previewCompanies, previewSpareParts } from "@/lib/preview";

export default async function SparePartsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const profile = await requireProfile();
  const initialQuery = searchParams.q ?? "";

  if (PREVIEW) {
    return (
      <SparePartsView
        profile={profile}
        companies={previewCompanies}
        parts={previewSpareParts}
        initialQuery={initialQuery}
      />
    );
  }

  const supabase = createClient();

  const [{ data: companies }, { data: parts }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase
      .from("spare_parts")
      .select("*, spare_part_photos(*)")
      .order("name"),
  ]);

  return (
    <SparePartsView
      profile={profile}
      companies={(companies ?? []) as Company[]}
      parts={(parts ?? []) as SparePart[]}
      initialQuery={initialQuery}
    />
  );
}
