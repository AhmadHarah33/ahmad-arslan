import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import ThemeProvider from "@/components/theme/theme-provider";
import BackgroundProvider from "@/components/theme/background-provider";
import type { ThemeMode } from "@/lib/theme";
import type { AppSettings } from "@/lib/types";
import { PREVIEW, previewAppSettings } from "@/lib/preview";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  let settings: AppSettings = previewAppSettings;
  if (!PREVIEW) {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (data) settings = data as AppSettings;
  }

  return (
    <>
      <ThemeProvider
        accent={profile.theme_accent ?? "sky"}
        mode={(profile.theme_mode as ThemeMode) ?? "system"}
      />
      <BackgroundProvider style={settings.bg_style} blur={settings.bg_blur} />
      <AppShell profile={profile} bgStyle={settings.bg_style} bgBlur={settings.bg_blur}>
        {children}
      </AppShell>
    </>
  );
}
