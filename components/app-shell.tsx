"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { isHead } from "@/lib/permissions";

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/customers", label: "Customers", icon: CustomersIcon },
  { href: "/spare-parts", label: "Parts", icon: PartsIcon },
];

export default function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = [...NAV];
  if (isHead(profile)) {
    nav.push({ href: "/admin", label: "Team", icon: TeamIcon });
  }

  function active(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-surface-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            M
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">Mars Support</p>
            <p className="text-xs text-ink-faint">Med Dent</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active(item.href)
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-muted hover:bg-surface-soft hover:text-ink"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-surface-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-ink">
              {profile.full_name || "User"}
            </p>
            <p className="text-xs capitalize text-ink-faint">
              {profile.role === "head" ? "Head of engineers" : "Engineer"}
            </p>
          </div>
          <button onClick={signOut} className="btn-ghost w-full">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-surface-border bg-surface px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              M
            </div>
            <span className="text-sm font-semibold">Mars Support</span>
          </div>
          <button
            onClick={signOut}
            className="text-sm font-medium text-ink-muted"
          >
            Sign out
          </button>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-surface-border bg-surface/95 backdrop-blur md:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              active(item.href) ? "text-brand-600" : "text-ink-faint"
            }`}
            style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
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
function TeamIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M18 19c0-2.2-1-4-2.5-4.6" />
    </svg>
  );
}
