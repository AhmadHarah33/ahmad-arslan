"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { AssigneeLite, Profile } from "@/lib/types";
import { isHead } from "@/lib/permissions";
import { PREVIEW } from "@/lib/preview";
import SettingsModal from "@/components/theme/settings-modal";
import CommandPalette from "@/components/search/command-palette";
import Toaster from "@/components/toaster";
import { Avatar } from "@/components/avatar";
import { applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { saveTheme } from "@/app/(app)/settings/actions";
import type { BackgroundStyle } from "@/lib/types";

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/customers", label: "Customers", icon: CustomersIcon },
  { href: "/spare-parts", label: "Parts", icon: PartsIcon },
];

export default function AppShell({
  profile,
  teammates,
  bgStyle,
  bgBlur,
  children,
}: {
  profile: Profile;
  teammates: AssigneeLite[];
  bgStyle: BackgroundStyle;
  bgBlur: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(
    (profile.theme_mode as ThemeMode) ?? "light"
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const nav = [...NAV];
  if (isHead(profile)) {
    nav.push({ href: "/admin", label: "Team", icon: TeamIcon });
  }

  function active(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Light/dark straight from the rail — applied instantly, saved to the profile.
  function pickMode(next: ThemeMode) {
    setMode(next);
    applyTheme(profile.theme_accent ?? "sky", next);
    void saveTheme(profile.theme_accent ?? "sky", next);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const others = teammates.filter((t) => t.id !== profile.id);

  return (
    <div className="min-h-screen">
      {/* Canvas the app frame floats on */}
      <div className="app-bg" aria-hidden="true" />

      <div className="flex min-h-screen gap-3 md:p-3">
        {/* Desktop utility rail */}
        <aside className="glass-strong sticky top-3 hidden h-[calc(100vh-1.5rem)] w-14 shrink-0 flex-col items-center rounded-3xl border border-surface-border py-3 md:flex">
          <div className="seg flex-col gap-0.5 p-1">
            <button
              onClick={() => pickMode("light")}
              aria-label="Light mode"
              title="Light mode"
              className={`seg-btn h-8 w-8 px-0 ${mode !== "dark" ? "seg-btn-on" : ""}`}
            >
              <SunIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => pickMode("dark")}
              aria-label="Dark mode"
              title="Dark mode"
              className={`seg-btn h-8 w-8 px-0 ${mode === "dark" ? "seg-btn-on" : ""}`}
            >
              <MoonIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 flex flex-1 flex-col items-center gap-1.5">
            <RailButton label="Search" onClick={() => setSearchOpen(true)}>
              <SearchIcon className="h-5 w-5" />
            </RailButton>
            <RailButton label="Appearance" onClick={() => setSettingsOpen(true)}>
              <GearIcon className="h-5 w-5" />
            </RailButton>
          </div>

          <RailButton label="Sign out" onClick={signOut}>
            <SignOutIcon className="h-5 w-5" />
          </RailButton>
        </aside>

        {/* App frame */}
        <div className="glass-strong flex min-w-0 flex-1 flex-col overflow-hidden md:rounded-3xl md:border md:border-surface-border">
          {/* Desktop top bar: brand · nav pills · people */}
          <header className="hidden items-center gap-4 px-5 py-3.5 md:flex">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                M
              </span>
              <span className="text-[15px] font-semibold text-ink">
                Mars Support
              </span>
            </Link>

            <nav className="seg mx-auto">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`seg-btn ${active(item.href) ? "seg-btn-on" : ""}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-3">
              {others.length > 0 && (
                <div className="hidden items-center lg:flex">
                  <div className="flex -space-x-2">
                    {others.slice(0, 4).map((p) => (
                      <span key={p.id} className="rounded-full ring-2 ring-surface">
                        <Avatar id={p.id} name={p.full_name || p.first_name} size={28} />
                      </span>
                    ))}
                  </div>
                  {others.length > 4 && (
                    <span className="ml-1.5 text-xs font-medium text-ink-muted">
                      +{others.length - 4}
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                title="Search (⌘K)"
                className="icon-btn h-9 w-9 border border-surface-border"
              >
                <SearchIcon className="h-4 w-4" />
              </button>

              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 rounded-full border border-surface-border py-1 pl-1 pr-3 text-left transition hover:bg-surface-soft"
                title="Appearance"
              >
                <Avatar
                  id={profile.id}
                  name={profile.full_name || profile.first_name || "User"}
                  size={28}
                />
                <span className="leading-tight">
                  <span className="block text-xs font-semibold text-ink">
                    {profile.first_name || profile.full_name || "User"}
                  </span>
                  <span className="block text-[10px] text-ink-faint">
                    {profile.role === "head" ? "Head of engineers" : "Engineer"}
                  </span>
                </span>
              </button>
            </div>
          </header>

          {/* Mobile top bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-surface-border bg-surface px-4 py-3 md:hidden">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                M
              </span>
              <span className="text-sm font-semibold">Mars Support</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="icon-btn h-9 w-9"
              >
                <SearchIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => pickMode(mode === "dark" ? "light" : "dark")}
                aria-label="Toggle dark mode"
                className="icon-btn h-9 w-9"
              >
                {mode === "dark" ? (
                  <SunIcon className="h-5 w-5" />
                ) : (
                  <MoonIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label="Appearance"
                className="icon-btn h-9 w-9"
              >
                <GearIcon className="h-5 w-5" />
              </button>
              <button onClick={signOut} aria-label="Sign out" className="icon-btn h-9 w-9">
                <SignOutIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          {PREVIEW && (
            <div className="bg-brand-600 px-4 py-1.5 text-center text-xs font-medium text-white">
              Preview mode — sample data, nothing is saved
            </div>
          )}

          <main className="flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-2">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-surface-border bg-surface md:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              active(item.href) ? "text-ink" : "text-ink-faint"
            }`}
            style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      {settingsOpen && (
        <SettingsModal
          initialAccent={profile.theme_accent ?? "sky"}
          initialMode={mode}
          isOwner={isHead(profile)}
          initialBgStyle={bgStyle}
          initialBgBlur={bgBlur}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toaster />
    </div>
  );
}

// Square icon button in the desktop rail, with a hover tooltip.
function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="icon-btn h-10 w-10"
    >
      {children}
    </button>
  );
}

/* --- inline icons (no dependency) --- */
function HomeIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}
function TasksIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="4" width="6" height="16" rx="1.5" />
      <rect x="14" y="4" width="6" height="10" rx="1.5" />
    </svg>
  );
}
function CustomersIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </svg>
  );
}
function PartsIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}
function TeamIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M18 19c0-2.2-1-4-2.5-4.6" />
    </svg>
  );
}
function SearchIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
function SunIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}
function MoonIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}
function GearIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function SignOutIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
