"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";
import type { AssigneeLite, Company, Profile } from "@/lib/types";
import { isHead } from "@/lib/permissions";
import { useT } from "@/lib/i18n/provider";
import { roleKey } from "@/lib/i18n/roles";
import CommandPalette from "@/components/search/command-palette";
import Toaster from "@/components/toaster";
import { Avatar } from "@/components/avatar";
import { profileImageUrl } from "@/lib/storage";
import { applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { saveTheme } from "@/app/(app)/settings/actions";
import type { BackgroundStyle } from "@/lib/types";
import { MarsTile, MarsWordmark } from "@/components/mars-mark";
import { DesktopSidebar, Sidebar, SidebarLink } from "@/components/ui/sidebar";
import {
  IconBook2,
  IconHome,
  IconLayoutKanban,
  IconLogout,
  IconMoon,
  IconNotes,
  IconPackage,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconSun,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", key: "nav.home", icon: HomeIcon },
  { href: "/tasks", key: "nav.tasks", icon: TasksIcon },
  { href: "/customers", key: "nav.customers", icon: CustomersIcon },
  { href: "/agreements", key: "nav.agreements", icon: AgreementsIcon },
  { href: "/spare-parts", key: "nav.parts", icon: PartsIcon },
  { href: "/catalog", key: "nav.catalog", icon: CatalogIcon },
] as const;

// Pages that get a slot in the phone's bottom bar.
const MOBILE_TABS: string[] = ["/", "/tasks", "/agreements", "/customers", "/spare-parts", "/catalog"];

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
  const [hoverTree, setHoverTree] = useState<"customers" | "parts" | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function hoverIn(id: "customers" | "parts") {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHoverTree(id);
  }
  function hoverOut() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverTree(null), 160);
  }
  function toggleTree(id: "customers" | "parts") {
    setExpandedTree((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Settings is its own page now (profile, picture, e-mail, password, look).
  const openSettings = () => router.push("/settings");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ThemeMode>(
    (profile.theme_mode as ThemeMode) ?? "light"
  );

  // The home page carries its own search button in its header (no top bar).
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener("app:open-search", open);
    return () => window.removeEventListener("app:open-search", open);
  }, []);

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
      ? ([
          { href: "/notes", key: "nav.notes", icon: NotesIcon },
          { href: "/admin", key: "nav.team", icon: TeamIcon },
        ] as const)
      : []),
  ];

  const tabLink = (href: string) => {
    const item = nav.find((n) => n.href === href);
    if (!item) return null;
    return (
      <Link
        key={href}
        href={href}
        className={`flex flex-col items-center gap-[3px] py-1.5 text-[10px] ${
          active(href) ? "font-bold text-ink" : "font-medium text-ink-faint"
        }`}
      >
        <item.icon className="h-[22px] w-[22px]" />
        {t(item.key)}
      </Link>
    );
  };

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
        {/* Desktop sidebar (Aceternity): an icon rail that opens on hover. The
            slot keeps the rail's width so the page never shifts; the panel
            grows over the page instead of pushing it. */}
        <div className="relative z-40 hidden w-[84px] shrink-0 md:block">
          {/* Softly blurs the page while the rail is open. Hidden (not just
              transparent) when closed so it costs nothing at rest. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none fixed inset-0 bg-black/10 backdrop-blur-[3px] transition-[opacity,visibility] duration-300 ${
              railOpen ? "visible opacity-100" : "invisible opacity-0"
            }`}
          />
          <div className="sticky top-3 h-[calc(100vh-1.5rem)]">
            <Sidebar open={railOpen} setOpen={setRailOpen}>
              <DesktopSidebar className="card absolute inset-y-0 left-0 z-40 justify-between gap-6 rounded-[20px]">
                <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
                  {/* Brand */}
                  <Link href="/" className="flex items-center gap-2.5 pt-1">
                    {railOpen ? (
                      <>
                        <MarsTile size={56} />
                        <MarsWordmark size={20} />
                      </>
                    ) : (
                      <MarsTile size={36} />
                    )}
                  </Link>

                  {/* Pages */}
                  <nav className="mt-6 flex flex-col gap-1">
                    {nav.map((item) => {
                      const treeId =
                        item.key === "nav.customers"
                          ? "customers"
                          : item.key === "nav.parts"
                          ? "parts"
                          : null;
                      const onThisPage = active(item.href);
                      const on = treeId ? onThisPage && !activeBrand : onThisPage;
                      const row = (
                        <SidebarLink
                          link={{
                            label: t(item.key),
                            href: item.href,
                            icon: (
                              <item.icon
                                className={`h-5 w-5 shrink-0 ${on ? "text-ink" : "text-ink-muted"}`}
                              />
                            ),
                          }}
                          active={on}
                          className={cn(
                            "min-w-0 flex-1 rounded-xl px-2",
                            on && "bg-brand-600/10"
                          )}
                        />
                      );

                      if (!treeId) return <div key={item.href}>{row}</div>;

                      // Open when pinned with the arrow, or while the pointer is over the
                      // arrow or its list. The close is delayed a beat (hoverOut) so moving
                      // from the item down into the list never flickers.
                      const pinned = expandedTree.has(treeId);
                      const show = railOpen && (pinned || hoverTree === treeId);
                      const links = [
                        ...(treeId === "customers"
                          ? [{ key: "none", href: "/customers?brand=__none__", label: t("customers.noBrand"), on: onThisPage && activeBrand === "__none__" }]
                          : []),
                        ...companies.map((c) => ({
                          key: c.id,
                          href: `${item.href}?brand=${c.id}`,
                          label: c.name,
                          on: onThisPage && activeBrand === c.id,
                        })),
                      ];
                      return (
                        <div key={item.href}>
                          <div className="flex items-center gap-1">
                            {row}
                            {railOpen && (
                              <button
                                type="button"
                                onClick={() => toggleTree(treeId)}
                                onMouseEnter={() => hoverIn(treeId)}
                                onMouseLeave={hoverOut}
                                aria-expanded={show}
                                aria-label={t(treeId === "customers" ? "customers.brands" : "parts.brands")}
                                className="icon-btn h-6 w-6 shrink-0"
                              >
                                <ChevronIcon
                                  className={`h-3.5 w-3.5 transition-transform duration-300 ${show ? "rotate-180" : ""}`}
                                />
                              </button>
                            )}
                          </div>

                          <div
                            aria-hidden={!show}
                            onMouseEnter={() => hoverIn(treeId)}
                            onMouseLeave={hoverOut}
                            className="grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                            style={{
                              gridTemplateRows: show ? "1fr" : "0fr",
                              opacity: show ? 1 : 0,
                              visibility: show ? "visible" : "hidden",
                            }}
                          >
                            <div className="overflow-hidden">
                              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-surface-border pl-2.5">
                                {links.map((l, i) => (
                                  <div
                                    key={l.key}
                                    className="transition duration-300 ease-out"
                                    style={{
                                      opacity: show ? 1 : 0,
                                      transform: show ? "none" : "translateY(-6px)",
                                      transitionDelay: show ? `${Math.min(i, 8) * 25}ms` : "0ms",
                                    }}
                                  >
                                    <TreeLink href={l.href} label={l.label} active={l.on} />
                                  </div>
                                ))}
                                {companies.length === 0 && (
                                  <p className="px-2 py-1 text-xs text-ink-faint">—</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </nav>
                </div>

                {/* Bottom: light/dark, settings, account */}
                <div className="flex flex-col gap-1 border-t border-surface-border pt-2">
                  <SidebarLink
                    link={{
                      label: mode === "dark" ? t("shell.light") : t("shell.dark"),
                      onClick: () => pickMode(mode === "dark" ? "light" : "dark"),
                      icon:
                        mode === "dark" ? (
                          <SunIcon className="h-5 w-5 shrink-0 text-ink-muted" />
                        ) : (
                          <MoonIcon className="h-5 w-5 shrink-0 text-ink-muted" />
                        ),
                    }}
                    className="rounded-xl px-2"
                  />
                  <SidebarLink
                    link={{
                      label: t("shell.settings"),
                      onClick: () => openSettings(),
                      icon: <GearIcon className="h-5 w-5 shrink-0 text-ink-muted" />,
                    }}
                    className="rounded-xl px-2"
                  />

                  {/* Account — click for the sign-out menu */}
                  <div className="relative mt-1" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen((v) => !v)}
                      aria-haspopup="menu"
                      aria-expanded={userMenuOpen}
                      className="flex w-full items-center gap-2 rounded-xl py-1 text-left transition hover:opacity-90"
                    >
                      <Avatar
                        id={profile.id}
                        name={profile.full_name || profile.first_name || "User"}
                        src={profileImageUrl(profile.avatar_path)}
                        size={36}
                      />
                      {railOpen && (
                        <>
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
                        </>
                      )}
                    </button>

                    {userMenuOpen && (
                      <div
                        role="menu"
                        className="glass glass-strong animate-pop absolute bottom-full left-0 z-30 mb-1 w-56 overflow-hidden rounded-2xl border border-surface-border py-1"
                      >
                        <button
                          role="menuitem"
                          onClick={() => {
                            setUserMenuOpen(false);
                            openSettings();
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
                </div>
              </DesktopSidebar>
            </Sidebar>
          </div>
        </div>

        {/* App frame */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between bg-[rgb(var(--canvas))] px-4 pb-2 pt-3 md:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <MarsTile size={52} />
              <MarsWordmark size={16} />
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                aria-label={t("shell.search")}
                className="card flex h-11 w-11 items-center justify-center rounded-[14px] text-ink"
              >
                <SearchIcon className="h-5 w-5" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-label={t("shell.settings")}
                  className="block rounded-full"
                >
                  <Avatar
                    id={profile.id}
                    name={profile.full_name || profile.first_name || "User"}
                    src={profileImageUrl(profile.avatar_path)}
                    size={44}
                  />
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                    <div
                      role="menu"
                      className="card glass-strong animate-pop absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-2xl py-1"
                    >
                      {nav
                        .filter((n) => !MOBILE_TABS.includes(n.href))
                        .map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            onClick={() => setMoreOpen(false)}
                            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-ink transition hover:bg-surface-soft"
                          >
                            <item.icon className="h-4 w-4" />
                            {t(item.key)}
                          </Link>
                        ))}
                      <div className="my-1 border-t border-surface-border" />
                      <button
                        role="menuitem"
                        onClick={() => pickMode(mode === "dark" ? "light" : "dark")}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-ink transition hover:bg-surface-soft"
                      >
                        {mode === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                        {t("misc.toggleDark")}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          openSettings();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-ink transition hover:bg-surface-soft"
                      >
                        <GearIcon className="h-4 w-4" />
                        {t("shell.settings")}
                      </button>
                      <button
                        role="menuitem"
                        onClick={signOut}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 transition hover:bg-surface-soft"
                      >
                        <SignOutIcon className="h-4 w-4" />
                        {t("shell.signOut")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Pages run to 1720px rather than the old max-w-6xl (1152px): every
              screen here is a board, a table or a card grid, all of which just
              fit more per row as they widen. The cap and the main's own padding
              are what keep content off the panel's corners on a very wide
              monitor, instead of letting a row stretch edge to edge. */}
          <main className="flex-1 px-4 pb-36 pt-4 md:px-6 md:pb-8 md:pt-5 xl:px-8">
            <div className="mx-auto w-full max-w-[1720px]">{children}</div>
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar: every main page. Team (head only) lives in the
          avatar menu up top. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 items-center border-t border-surface-border bg-surface/95 px-1 pt-1.5 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        {MOBILE_TABS.map((href) => tabLink(href))}
      </nav>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toaster />
    </div>
  );
}

/* --- inline icons (no dependency) --- */
function HomeIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconHome stroke={1.8} {...(p as object)} />;
}
function TasksIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconLayoutKanban stroke={1.8} {...(p as object)} />;
}
function CustomersIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconUsers stroke={1.8} {...(p as object)} />;
}
function AgreementsIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconShieldCheck stroke={1.8} {...(p as object)} />;
}
function PartsIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconPackage stroke={1.8} {...(p as object)} />;
}
function CatalogIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconBook2 stroke={1.8} {...(p as object)} />;
}
function NotesIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconNotes stroke={1.8} {...(p as object)} />;
}
function TeamIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconUsersGroup stroke={1.8} {...(p as object)} />;
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
  return <IconSearch stroke={1.8} {...(p as object)} />;
}
function SunIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconSun stroke={1.8} {...(p as object)} />;
}
function MoonIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconMoon stroke={1.8} {...(p as object)} />;
}
function GearIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconSettings stroke={1.8} {...(p as object)} />;
}
function SignOutIcon(p: React.SVGProps<SVGSVGElement>) {
  return <IconLogout stroke={1.8} {...(p as object)} />;
}
