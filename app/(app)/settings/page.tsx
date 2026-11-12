import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ProfileSettings from "@/components/settings/profile-settings";
import { isHead } from "@/lib/permissions";
import type { BackgroundStyle } from "@/lib/types";

export default async function SettingsPage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const [{ data: auth }, { data: app }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("app_settings").select("bg_style, bg_blur").eq("id", 1).single(),
  ]);

  return (
    <ProfileSettings
      profile={profile}
      email={auth.user?.email ?? ""}
      isOwner={isHead(profile)}
      bgStyle={((app?.bg_style as BackgroundStyle | undefined) ?? "solid")}
      bgBlur={app?.bg_blur ?? 40}
    />
  );
}
