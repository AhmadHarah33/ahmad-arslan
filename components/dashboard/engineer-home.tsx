"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { priorityKey, statusKey } from "@/lib/i18n/task-keys";
import type { EngineerData, EngineerTask } from "@/lib/dashboard.engineer";
import { moveTask } from "@/app/(app)/tasks/actions";
import type { SharedLink } from "@/lib/shared-links";
import { CountUp, Reveal, useInView } from "@/components/dashboard/motion";
import { CARD, DataCard } from "@/components/dashboard/head-home";
import Scanner from "@/components/scan/scanner";
import { IconCheck, IconPackage, IconPlus, IconQrcode, IconUsers } from "@tabler/icons-react";

// Home screen for an engineer. Built for a phone in the field: the first
// screenful is "what do I have to do", and finishing a job is one tap on its
// row. Desktop just spreads it out.

const DONE = "rgb(var(--tone-done))";
const DOT: Record<string, string> = {
  stuck: "rgb(var(--tone-stuck))",
  in_progress: "rgb(var(--tone-warn))",
  pending_approval: "rgb(var(--tone-warn))",
  todo: "rgb(var(--tone-neutral))",
};

export default function EngineerHome({
  greeting,
  today,
  data,
  links,
  canEditLinks,
}: {
  greeting: { hello: string; name: string };
  today: string;
  data: EngineerData;
  links: SharedLink[];
  canEditLinks: boolean;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const locale = lang === "tr" ? "tr-TR" : "en-GB";
  const eyebrow = new Date(`${today}T00:00:00Z`).toLocaleDateString(locale, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <Reveal>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-muted sm:text-[13px]">{eyebrow}</p>
            <h1 className="text-[28px] font-medium tracking-tight text-ink sm:text-4xl">
              {greeting.hello}, <span className="text-ink-faint">{greeting.name}</span>
            </h1>
          </div>
          <Link
            href="/tasks?new=1"
            className="btn-primary hidden min-h-[48px] rounded-full px-5 transition active:scale-95 sm:inline-flex"
          >
            <span aria-hidden className="text-lg leading-none">
              +
            </span>
            {t("dash.newTask")}
          </Link>
        </div>
      </Reveal>

      {/* Top: the number that matters (2/3) beside the shared drives (1/3). On a
          phone the drives drop to the bottom of the page. */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <Reveal delay={80} className="lg:col-span-2">
          <Today data={data} today={today} locale={locale} />
        </Reveal>
        <Reveal delay={150} className="hidden lg:flex lg:flex-col [&>*]:flex-1">
          <DataCard links={links} canEdit={canEditLinks} />
        </Reveal>
      </div>

      <Reveal delay={110}>
        <QuickActions />
      </Reveal>

      {/* Bottom: my tasks (2/3) and my next visits (1/3), level at the bottom. */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <Reveal delay={120}>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-semibold text-ink">{t("eng.myTasks")}</h2>
              <Link href="/tasks" className="flex min-h-[44px] items-center text-[13px] font-semibold text-ink-muted hover:text-ink">
                {t("eng.all")} ›
              </Link>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className={`${CARD} divide-y divide-surface-border overflow-hidden rounded-3xl`}>
              {data.tasks.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-faint">{t("dash.noTasks")}</p>
              ) : (
                data.tasks.map((task) => <TaskRow key={task.id} task={task} />)
              )}
            </div>
          </Reveal>
        </section>
        <Reveal delay={220} className="flex flex-col lg:pt-[56px]">
          <NextVisits data={data} locale={locale} />
        </Reveal>
        <Reveal delay={280} className="lg:hidden">
          <DataCard links={links} canEdit={canEditLinks} />
        </Reveal>
      </div>
    </div>
  );
}

/* --------------------------------- Today --------------------------------- */

function Today({ data, today, locale }: { data: EngineerData; today: string; locale: string }) {
  const t = useT();
  const [ref, seen] = useInView<HTMLDivElement>();
  const total = data.open + data.doneWeek;
  const pct = total ? Math.round((data.doneWeek / total) * 100) : 0;
  const c = 2 * Math.PI * 40;
  const max = Math.max(1, ...data.closedPerDay.map((d) => d.n));
  const wd = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", weekday: "short" });

  // Three plain facts, each readable at a glance.
  const facts = [
    { n: data.stuck, label: t("eng.stuck"), color: data.stuck ? "rgb(var(--tone-stuck-ink))" : undefined },
    { n: data.visitsToday, label: t("eng.visit"), color: undefined },
    { n: data.doneWeek, label: t("eng.doneWeek"), color: "rgb(var(--tone-done-ink))" },
  ];

  return (
    <section className={`${CARD} flex flex-col gap-5 rounded-3xl p-4 sm:p-6`}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        {/* The number that matters */}
        <div className="min-w-0">
          <span className="text-sm font-medium text-ink-muted sm:text-base">{t("eng.openToday")}</span>
          <div>
            <CountUp
              value={data.open}
              decimals={1}
              mutedDecimals
              className="text-[64px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[84px]"
            />
          </div>
        </div>

        {/* Facts */}
        <div className="order-3 grid w-full grid-cols-3 gap-2.5 sm:order-none sm:w-auto sm:flex-1 sm:gap-3">
          {facts.map((f) => (
            <div key={f.label} className="rounded-2xl bg-surface-soft px-3 py-3 sm:px-5 sm:py-4">
              <div className="text-[28px] font-semibold leading-none tabular-nums text-ink sm:text-[34px]" style={f.color ? { color: f.color } : undefined}>
                {f.n}
              </div>
              <div className="mt-1.5 text-xs leading-tight text-ink-muted sm:text-[13px]">{f.label}</div>
            </div>
          ))}
        </div>

        {/* Week progress */}
        <div ref={ref} className="ml-auto flex shrink-0 flex-col items-center gap-1.5">
          <div className="relative h-[92px] w-[92px] sm:h-[104px] sm:w-[104px]">
            <svg viewBox="0 0 96 96" className="-rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgb(var(--surface-soft))" strokeWidth="9" />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke={DONE}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${seen ? (pct / 100) * c : 0} ${c}`}
                style={{ transition: "stroke-dasharray 1300ms cubic-bezier(.4,0,.2,1)" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-ink sm:text-2xl">
              <CountUp value={pct} format={(n) => `${Math.round(n)}%`} />
            </span>
          </div>
          <span className="text-xs font-medium text-ink-muted">{t("eng.weekProgress")}</span>
        </div>
      </div>

      {/* Tasks closed per day, with the count on top of each bar */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-muted sm:text-[13px]">{t("eng.closedPerDay")}</span>
        <div className="flex h-24 items-end gap-2 border-b border-surface-border sm:h-28 sm:gap-3">
          {data.closedPerDay.map((d, i) => {
            const isToday = d.date === today;
            return (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className={`text-xs font-semibold tabular-nums sm:text-sm ${d.n ? "text-ink" : "text-ink-faint"}`}>{d.n}</span>
                <span
                  className="block w-full origin-bottom rounded-t-lg"
                  style={{
                    height: `${d.n ? Math.max(14, (d.n / max) * 70) : 4}%`,
                    background: d.n
                      ? isToday
                        ? "rgb(var(--tone-warn))"
                        : "rgb(var(--tone-done))"
                      : "rgb(var(--surface-border))",
                    transform: seen ? "scaleY(1)" : "scaleY(0)",
                    transition: `transform 700ms cubic-bezier(.3,1.2,.4,1) ${i * 70}ms`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 sm:gap-3">
          {data.closedPerDay.map((d) => (
            <span
              key={d.date}
              className={`flex-1 text-center text-xs sm:text-[13px] ${d.date === today ? "font-semibold text-ink" : "text-ink-muted"}`}
            >
              {d.date === today ? t("head.today") : wd(d.date)}
            </span>
          ))}
        </div>
      </div>

      {/* Today's visit, or a slim line when there is none. */}
      {data.visitToday ? (
        <Link
          href={`/agreements/${data.visitToday.agreement_id}/edit`}
          className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl bg-surface-soft px-4 text-[13px] transition hover:opacity-80"
        >
          <span className="flex shrink-0 items-center gap-2.5 text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONE }} />
            {t("eng.visitToday")}
          </span>
          <span className="min-w-0 truncate font-semibold text-ink">
            {data.visitToday.name}
            {data.visitToday.sub ? ` · ${data.visitToday.sub}` : ""}
          </span>
        </Link>
      ) : (
        <Link
          href="/agreements"
          className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl bg-surface-soft px-4 text-[13px] transition hover:opacity-80"
        >
          <span className="shrink-0 text-ink-muted">{t("eng.noVisitToday")}</span>
          {data.nextVisits[0] && (
            <span className="min-w-0 truncate font-semibold text-ink">
              {t("dash.nextVisit")}: {data.nextVisits[0].name} ·{" "}
              {new Date(`${data.nextVisits[0].date}T00:00:00Z`).toLocaleDateString(locale, {
                timeZone: "UTC",
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </Link>
      )}
    </section>
  );
}

/* -------------------------------- Task card ------------------------------- */

function TaskRow({ task }: { task: EngineerTask }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<"done" | "approval" | null>(null);
  const [error, setError] = useState(false);

  const finish = () =>
    start(async () => {
      setError(false);
      const r = await moveTask(task.id, "done", task.position);
      if ("error" in r && r.error) return setError(true);
      setOutcome(r.task?.status === "pending_approval" ? "approval" : "done");
    });

  const hidden = outcome !== null;
  const meta = [
    t(statusKey(task.status)),
    task.parts > 0 ? `${task.parts} ${task.parts === 1 ? t("head.part") : t("head.parts")}` : "",
    t(priorityKey(task.priority)),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
      style={{ gridTemplateRows: hidden ? "0fr" : "1fr", opacity: hidden ? 0 : 1 }}
    >
      <div className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: DOT[task.status] }} />
          <Link href="/tasks" className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{task.title}</span>
            <span
              className="block truncate text-xs text-ink-muted"
              style={error ? { color: "rgb(var(--tone-stuck-ink))" } : task.status === "stuck" ? { color: "rgb(var(--tone-stuck-ink))" } : undefined}
            >
              {error ? t("eng.failed") : meta}
            </span>
          </Link>
          <button
            type="button"
            onClick={finish}
            disabled={pending}
            className="done-btn flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition active:scale-95 disabled:opacity-60"
          >
            {pending ? "…" : (
              <>
                <IconCheck className="h-4 w-4" stroke={2.2} />
                {t("eng.done")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Quick actions ----------------------------- */

// The four things done most in the field. Scan QR opens the camera right here
// and jumps to whatever the code points at (same behaviour as the search box).
function QuickActions() {
  const t = useT();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);

  function onScan(value: string) {
    setScanning(false);
    try {
      const url = new URL(value);
      router.push(url.pathname + url.search);
    } catch {
      router.push(`/customers?q=${encodeURIComponent(value)}`);
    }
  }

  const tile =
    "dark-card group flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-3xl border border-surface-border bg-surface px-2 py-2.5 text-center shadow-card transition duration-300 hover:shadow-pop active:scale-[0.97] sm:min-h-[56px] sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-2 sm:text-left";
  const icon =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-ink transition duration-300 group-hover:bg-ink group-hover:text-surface";
  const label = "text-xs font-semibold text-ink sm:text-[13px]";

  return (
    <>
      <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
        <button type="button" onClick={() => setScanning(true)} className={tile}>
          <span className={icon}>
            <IconQrcode className="h-[18px] w-[18px]" stroke={1.8} />
          </span>
          <span className={label}>{t("eng.scan")}</span>
        </button>
        <Link href="/tasks?new=1" className={tile}>
          <span className={icon}>
            <IconPlus className="h-[18px] w-[18px]" stroke={1.8} />
          </span>
          <span className={label}>{t("dash.newTask")}</span>
        </Link>
        <Link href="/spare-parts" className={tile}>
          <span className={icon}>
            <IconPackage className="h-[18px] w-[18px]" stroke={1.8} />
          </span>
          <span className={label}>{t("dash.browseParts")}</span>
        </Link>
        <Link href="/customers" className={tile}>
          <span className={icon}>
            <IconUsers className="h-[18px] w-[18px]" stroke={1.8} />
          </span>
          <span className={label}>{t("nav.customers")}</span>
        </Link>
      </div>
      {scanning && <Scanner onResult={onScan} onClose={() => setScanning(false)} />}
    </>
  );
}

/* ------------------------------ Next visits ------------------------------ */

function NextVisits({ data, locale }: { data: EngineerData; locale: string }) {
  const t = useT();
  return (
    <section className={`${CARD} flex-1 p-5 sm:p-[22px]`}>
      <h2 className="mb-1 text-[17px] font-semibold text-ink">{t("eng.nextVisits")}</h2>
      {data.nextVisits.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">{t("dash.noUpcoming")}</p>
      ) : (
        data.nextVisits.map((v) => {
          const d = new Date(`${v.date}T00:00:00Z`);
          const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, { timeZone: "UTC", ...o });
          return (
            <Link
              key={v.key}
              href={`/agreements/${v.agreement_id}/edit`}
              className="flex items-center gap-3 border-t border-surface-border py-2.5 transition first:border-t-0 hover:opacity-80"
            >
              <span className="flex h-[46px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-surface-soft leading-[1.05]">
                <b className="text-base">{f({ day: "numeric" })}</b>
                <span className="text-[9px] font-bold uppercase">{f({ month: "short" }).replace(".", "")}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{v.name}</span>
                <span className="block truncate text-xs text-ink-muted">{v.sub}</span>
              </span>
            </Link>
          );
        })
      )}
    </section>
  );
}
