import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import CustomersView from "@/components/customers/customers-view";
import type { Customer } from "@/lib/types";
import {
  PREVIEW,
  previewCustomers,
  previewFieldDefinitions,
  previewFieldValues,
} from "@/lib/preview";

export default async function CustomersPage() {
  const profile = await requireProfile();

  if (PREVIEW) {
    return (
      <CustomersView
        profile={profile}
        initialCustomers={previewCustomers}
        fieldDefs={previewFieldDefinitions.customer ?? []}
        fieldValues={previewFieldValues}
      />
    );
  }

  const supabase = createClient();

  const { data } = await supabase
    .from("customers")
    .select("*, customer_links(*)")
    .order("name");

  const customers = (data ?? []) as Customer[];
  const { defs, valueMap } = await loadFields(
    "customer",
    customers.map((c) => c.id)
  );

  return (
    <CustomersView
      profile={profile}
      initialCustomers={customers}
      fieldDefs={defs}
      fieldValues={valueMap}
    />
  );
}
