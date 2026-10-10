import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgreementFormData } from "@/lib/agreements.server";
import AgreementForm from "@/components/agreements/agreement-form";

export default async function NewAgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  await requireProfile();
  const data = await loadAgreementFormData(await createClient());
  return <AgreementForm {...data} presetCustomerId={(await searchParams).customer} />;
}
