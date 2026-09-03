"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";
import type { AssigneeLite, Company, Profile } from "@/lib/types";
import { isHead } from "@/lib/permissions";
import { useT } from "@/lib/i18n/provider";
import { roleKey } from "@/lib/i18n/roles";
import SettingsModal from "@/components/theme/settings-modal";
import CommandPalette from "@/components/search/command-palette";
import Toaster from "@/components/toaster";
import { Avatar } from "@/components/avatar";
import { applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { saveTheme } from "@/app/(app)/settings/actions";
import type { BackgroundStyle } from "@/lib/types";

const NAV = [
  { href: "/", key: "nav.home", icon: HomeIcon },
  { href: "/tasks", key: "nav.tasks", icon: TasksIcon },
  { href: "/customers", key: "nav.customers", icon: CustomersIcon },
  { href: "/spare-parts", key: "nav.parts", icon: PartsIcon },
  { href: "/catalog", key: "nav.catalog", icon: CatalogIcon },
] as const;

export default function AppShell({
  profile,
  teammates,
  companies,
  bgStyle,
  bgBlur,
  children,
}: {
  profile: Profile;
  teammates: AssigneeLite[];
  companies: Company[];
  bgStyle: BackgroundStyle;
  bgBlur: number;
  children: React.ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeBrand = searchParams.get("brand") ?? "";
  const [expandedTree, setExpandedTree] = useState<Set<"customers" | "parts">>(
    () => new Set(activeBrand ? (["customers", "parts"] as const) : [])
  );
  function toggleTree(id: "customers" | "parts") {
    setExpandedTree((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ThemeMode>(
    (profile.theme_mode as ThemeMode) ?? "light"
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close the account menu on any click outside it.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const nav = [
    ...NAV,
    ...(isHead(profile)
      ? ([{ href: "/admin", key: "nav.team", icon: TeamIcon }] as const)
      : []),
  ];

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
        {/* Desktop sidebar: account · pages · settings + sign out */}
        <aside className="glass-strong sticky top-3 hidden h-[calc(100vh-1.5rem)] w-56 shrink-0 flex-col rounded-3xl border border-surface-border p-3 md:flex">
          {/* Account — click for the sign-out menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex w-full items-center gap-2.5 rounded-2xl p-2 text-left transition hover:bg-surface-soft"
            >
              <Avatar
                id={profile.id}
                name={profile.full_name || profile.first_name || "User"}
                size={32}
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {profile.full_name || profile.first_name || "User"}
                </span>
                <span className="block truncate text-[11px] text-ink-faint">
                  {t(roleKey(profile.role))}
                </span>
              </span>
              <ChevronIcon
                className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${
                  userMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="glass glass-strong animate-pop absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-surface-border py-1"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink transition hover:bg-surface-soft"
                >
                  <GearIcon className="h-4 w-4" />
                  {t("shell.settings")}
                </button>
                <button
                  role="menuitem"
                  onClick={signOut}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 transition hover:bg-surface-soft"
                >
                  <SignOutIcon className="h-4 w-4" />
                  {t("shell.signOut")}
                </button>
              </div>
            )}
          </div>

          {/* Pages */}
          <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
            {nav.map((item) => {
              const treeId =
                item.key === "nav.customers"
                  ? "customers"
                  : item.key === "nav.parts"
                  ? "parts"
                  : null;

              if (!treeId) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                      active(item.href)
                        ? "bg-surface-soft text-ink"
                        : "text-ink-muted hover:bg-surface-soft hover:text-ink"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {t(item.key)}
                  </Link>
                );
              }

              const isOpen = expandedTree.has(treeId);
              const onThisPage = active(item.href);
              const noBrand = onThisPage && !activeBrand;

              return (
                <div key={item.href}>
                  <div
                    className={`flex items-center gap-1 rounded-xl pr-1 text-sm font-medium transition ${
                      noBrand
                        ? "bg-surface-soft text-ink"
                        : "text-ink-muted hover:bg-surface-soft hover:text-ink"
                    }`}
                  >
                    <Link
                      href={item.href}
                      prefetch
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t(item.key)}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleTree(treeId)}
                      aria-expanded={isOpen}
                      aria-label={t(treeId === "customers" ? "customers.brands" : "parts.brands")}
                      className="icon-btn h-6 w-6 shrink-0"
                    >
                      <ChevronIcon
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-surface-border pl-2.5">
                      {treeId === "customers" && (
                        <TreeLink
                          href="/customers?brand=__none__"
                          label={t("customers.noBrand")}
                          active={onThisPage && activeBrand === "__none__"}
                        />
                      )}
                      {companies.map((c) => (
                        <TreeLink
                          key={c.id}
                          href={`${item.href}?brand=${c.id}`}
                          label={c.name}
                          active={onThisPage && activeBrand === c.id}
                        />
                      ))}
                      {companies.length === 0 && (
                        <p className="px-2 py-1 text-xs text-ink-faint">—</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Bottom: light/dark, then settings next to sign out */}
          <div className="mt-2 space-y-2 border-t border-surface-border pt-2">
            <div className="seg w-full">
              <button
                onClick={() => pickMode("light")}
                className={`seg-btn flex-1 ${mode !== "dark" ? "seg-btn-on" : ""}`}
              >
                <SunIcon className="h-4 w-4" />
                {t("shell.light")}
              </button>
              <button
                onClick={() => pickMode("dark")}
                className={`seg-btn flex-1 ${mode === "dark" ? "seg-btn-on" : ""}`}
              >
                <MoonIcon className="h-4 w-4" />
                {t("shell.dark")}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-soft hover:text-ink"
              >
                <GearIcon className="h-4 w-4 shrink-0" />
                {t("shell.settings")}
              </button>
              <button
                onClick={signOut}
                aria-label={t("shell.signOut")}
                title={t("shell.signOut")}
                className="icon-btn h-9 w-9 shrink-0 text-ink-muted hover:text-red-600"
              >
                <SignOutIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
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

            {/* Page nav lives in the sidebar now; this spacer keeps the
                right-hand controls pinned to the right. */}
            <div className="flex-1" />

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

              {/* The only search entry point on desktop. The sidebar used to
                  carry a second one, which was redundant with this. */}
              <button
                onClick={() => setSearchOpen(true)}
                aria-label={t("shell.search")}
                title="Search (⌘K)"
                className="flex items-center gap-2 rounded-full border border-surface-border py-1.5 pl-3 pr-2.5 text-sm text-ink-faint transition hover:bg-surface-soft hover:text-ink"
              >
                <SearchIcon className="h-4 w-4" />
                <span className="hidden lg:inline">{t("shell.search")}</span>
                <kbd className="hidden rounded border border-surface-border px-1 py-0.5 text-[10px] font-medium lg:inline">
                  ⌘K
                </kbd>
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
                aria-label={t("shell.search")}
                className="icon-btn h-9 w-9"
              >
                <SearchIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => pickMode(mode === "dark" ? "light" : "dark")}
                aria-label={t("misc.toggleDark")}
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
                aria-label={t("shell.settings")}
                className="icon-btn h-9 w-9"
              >
                <GearIcon className="h-5 w-5" />
              </button>
              <button onClick={signOut} aria-label={t("shell.signOut")} className="icon-btn h-9 w-9">
                <SignOutIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Pages run to 1720px rather than the old max-w-6xl (1152px): every
              screen here is a board, a table or a card grid, all of which just
              fit more per row as they widen. The cap and the main's own padding
              are what keep content off the panel's corners on a very wide
              monitor, instead of letting a row stretch edge to edge. */}
          <main className="flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-2 xl:px-8">
            <div className="mx-auto w-full max-w-[1720px]">{children}</div>
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
            {t(item.key)}
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
function CatalogIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z" />
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
// One brand entry under the Customers/Parts tree in the sidebar.
function TreeLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={`block truncate rounded-lg px-2 py-1.5 text-[13px] font-medium transition ${
        active
          ? "bg-surface-soft text-ink"
          : "text-ink-faint hover:bg-surface-soft hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function ChevronIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
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
