import { requireProfile } from "@/lib/auth";
import AppShell from "@/components/app-shell";
import ThemeProvider from "@/components/theme/theme-provider";
import type { ThemeMode } from "@/lib/theme";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return (
    <>
      <ThemeProvider
        accent={profile.theme_accent ?? "sky"}
        mode={(profile.theme_mode as ThemeMode) ?? "system"}
      />
      <AppShell profile={profile}>{children}</AppShell>
    </>
  );
}
