import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import ThemeProvider from "@/components/theme/theme-provider";
import BackgroundProvider from "@/components/theme/background-provider";
import type { ThemeMode } from "@/lib/theme";
import type { AppSettings, AssigneeLite } from "@/lib/types";
import { PREVIEW, previewAppSettings, previewEngineers } from "@/lib/preview";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  let settings: AppSettings = previewAppSettings;
  let teammates: AssigneeLite[] = previewEngineers.map((e) => ({
    id: e.id,
    full_name: e.full_name,
    first_name: e.first_name,
  }));

  if (!PREVIEW) {
    const supabase = createClient();
    const [{ data }, { data: people }] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", 1).single(),
      supabase.from("profiles").select("id, full_name, first_name").order("full_name"),
    ]);
    if (data) settings = data as AppSettings;
    teammates = (people ?? []) as AssigneeLite[];
  }

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
