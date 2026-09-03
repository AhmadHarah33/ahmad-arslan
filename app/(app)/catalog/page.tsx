import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CatalogView from "@/components/catalog/catalog-view";
import type { City, Company, MachineModel } from "@/lib/types";

export default async function CatalogPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: companies }, { data: models }, { data: cities }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("machine_models").select("*").order("name"),
    supabase.from("cities").select("*").order("name"),
  ]);

  return (
    <CatalogView
      profile={profile}
      companies={(companies ?? []) as Company[]}
      models={(models ?? []) as MachineModel[]}
      cities={(cities ?? []) as City[]}
    />
  );
}
