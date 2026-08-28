import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CustomersView from "@/components/customers/customers-view";
import type { Customer } from "@/lib/types";

export default async function CustomersPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from("customers")
    .select("*, customer_links(*)")
    .order("name");

  return (
    <CustomersView
      profile={profile}
      initialCustomers={(data ?? []) as Customer[]}
    />
  );
}
