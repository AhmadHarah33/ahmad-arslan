import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import ThemeProvider from "@/components/theme/theme-provider";
import BackgroundProvider from "@/components/theme/background-provider";
import type { ThemeMode } from "@/lib/theme";
import type { AppSettings, AssigneeLite } from "@/lib/types";

const FALLBACK_SETTINGS: AppSettings = {
  id: 1,
  company_name: "Mars Med Dent",
  company_phone: "",
  company_address: "",
  logo_url: null,
  bg_style: "solid",
  bg_blur: 40,
};

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  const supabase = createClient();
  const [{ data }, { data: people }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", 1).single(),
    supabase.from("profiles").select("id, full_name, first_name").order("full_name"),
  ]);
  // The app_settings row is seeded by migration; fall back rather than crash
  // the whole shell if it is ever missing.
  const settings: AppSettings = (data as AppSettings | null) ?? FALLBACK_SETTINGS;
  const teammates = (people ?? []) as AssigneeLite[];

  return (
    <>
      <ThemeProvider
        accent={profile.theme_accent ?? "sky"}
        mode={(profile.theme_mode as ThemeMode) ?? "system"}
      />
      <BackgroundProvider style={settings.bg_style} blur={settings.bg_blur} />
      <AppShell
        profile={profile}
        teammates={teammates}
        bgStyle={settings.bg_style}
        bgBlur={settings.bg_blur}
      >
        {children}
      </AppShell>
    </>
  );
}
