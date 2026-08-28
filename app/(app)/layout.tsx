import { requireProfile } from "@/lib/auth";
import AppShell from "@/components/app-shell";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
