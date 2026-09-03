import Link from "next/link";
import type { StringKey } from "@/lib/i18n/dictionary";
import { getServerT } from "@/lib/i18n/server";

// Shared Google Drive folders the team already works out of. External, so they
// open in a new tab; rel="noreferrer" keeps the app's URL out of the referrer.
const DRIVE_LINKS: {
  href: string;
  titleKey: StringKey;
  descKey: StringKey;
  icon: "database" | "desktop";
}[] = [
  {
    href: "https://drive.google.com/drive/folders/1sGwxZYtF_dxSXz2HRgu3Erlx61LNqJKr?usp=drive_link",
    titleKey: "dash.database",
    descKey: "dash.databaseDesc",
    icon: "database",
  },
  {
    href: "https://drive.google.com/drive/folders/1m_BFgqE0Y-DFh_MydXtBE-vi1xh0904C?usp=drive_link",
    titleKey: "dash.desktopData",
    descKey: "dash.desktopDataDesc",
    icon: "desktop",
  },
];

const ACTIONS: {
  href: string;
  titleKey: StringKey;
  descKey: StringKey;
  icon: "plus" | "person" | "box" | "board";
}[] = [
  { href: "/tasks?new=1", titleKey: "dash.newTask", descKey: "dash.newTaskDesc", icon: "plus" },
  { href: "/customers", titleKey: "dash.addCustomer", descKey: "dash.addCustomerDesc", icon: "person" },
  { href: "/spare-parts", titleKey: "dash.browseParts", descKey: "dash.browsePartsDesc", icon: "box" },
  { href: "/tasks", titleKey: "dash.myBoard", descKey: "dash.myBoardDesc", icon: "board" },
];

export default function QuickActions() {
  const t = getServerT();

  return (
    <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("dash.quickActions")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.map((a) => (
            <Link
              key={a.href + a.titleKey}
              href={a.href}
              className="card flex items-start gap-3 p-4 transition hover:shadow-pop"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
                <Glyph name={a.icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{t(a.titleKey)}</span>
                <span className="mt-0.5 block text-xs text-ink-faint">{t(a.descKey)}</span>
              </span>
            </Link>
          ))}
        </div>
    </section>
  );
}

// Split out so the head dashboard can show the drives without the engineer
// quick actions, which duplicate cards it already has.
export function SharedDrives() {
  const t = getServerT();

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {t("dash.resources")}
      </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DRIVE_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="card flex items-center gap-3 p-4 transition hover:shadow-pop"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-ink-muted">
                <Glyph name={l.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{t(l.titleKey)}</span>
                <span className="mt-0.5 block text-xs text-ink-faint">{t(l.descKey)}</span>
              </span>
              <ExternalGlyph />
          </a>
        ))}
      </div>
    </section>
  );
}

function Glyph({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: "plus" | "person" | "box" | "board" | "database" | "desktop";
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "person")
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    );
  if (name === "box")
    return (
      <svg {...common}>
        <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z" />
        <path d="M3 8.5 12 13l9-4.5M12 13v7" />
      </svg>
    );
  if (name === "board")
    return (
      <svg {...common}>
        <rect x="3" y="4" width="6" height="16" rx="1.5" />
        <rect x="13" y="4" width="8" height="10" rx="1.5" />
      </svg>
    );
  if (name === "database")
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    );
  // desktop / PC
  return (
    <svg {...common}>
      <rect x="2.5" y="4" width="19" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function ExternalGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
