import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgreementFormData } from "@/lib/agreements.server";
import AgreementForm from "@/components/agreements/agreement-form";

export default async function NewAgreementPage({
  searchParams,
}: {
  searchParams: { customer?: string };
}) {
  await requireProfile();
  const data = await loadAgreementFormData(createClient());
  return <AgreementForm {...data} presetCustomerId={searchParams.customer} />;
}
