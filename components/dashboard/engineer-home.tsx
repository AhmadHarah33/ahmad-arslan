"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { priorityKey, statusKey } from "@/lib/i18n/task-keys";
import type { TaskPriority } from "@/lib/types";
import type { EngineerData, EngineerTask } from "@/lib/dashboard.engineer";
import { addAssignee, moveTask } from "@/app/(app)/tasks/actions";
import { CountUp, Reveal, useInView } from "@/components/dashboard/motion";
import { CARD, DataCard } from "@/components/dashboard/head-home";

// Home screen for an engineer. Built for a phone in the field: the first
// screenful is "what do I have to do", and the two most common actions (finish
// a job, claim one) are one tap on the card. Desktop just spreads it out.

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
}: {
  greeting: { hello: string; name: string };
  today: string;
  data: EngineerData;
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

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Reveal delay={80}>
          <Today data={data} today={today} locale={locale} />
        </Reveal>
        <Reveal delay={150}>
          <Visit data={data} locale={locale} />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3">
          <Reveal delay={120}>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-semibold text-ink">{t("eng.myTasks")}</h2>
              <Link href="/tasks" className="flex min-h-[44px] items-center text-[13px] font-semibold text-ink-muted hover:text-ink">
                {t("eng.all")} ›
              </Link>
            </div>
          </Reveal>
          {data.tasks.length === 0 ? (
            <Reveal delay={180}>
              <div className={`${CARD} px-5 py-8 text-center text-sm text-ink-faint`}>{t("dash.noTasks")}</div>
            </Reveal>
          ) : (
            data.tasks.map((task, i) => (
              <Reveal key={task.id} delay={160 + i * 60}>
                <TaskCard task={task} />
              </Reveal>
            ))
          )}
        </section>

        <div className="space-y-3 sm:space-y-4">
          <Reveal delay={200}>
            <Grabs data={data} />
          </Reveal>
          <Reveal delay={260}>
            <NextVisits data={data} locale={locale} />
          </Reveal>
          <Reveal delay={320}>
            <DataCard />
          </Reveal>
        </div>
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

  return (
    <section className={`${CARD} flex flex-wrap items-center gap-5 p-5 sm:rounded-[32px] sm:p-7`}>
      <div className="flex min-w-0 flex-1 basis-[180px] flex-col gap-1.5">
        <span className="text-[13px] text-ink-muted sm:text-[15px]">{t("eng.openToday")}</span>
        <CountUp
          value={data.open}
          decimals={1}
          mutedDecimals
          className="text-[64px] font-semibold leading-[0.9] tracking-[-0.05em] text-ink sm:text-[88px]"
        />
        <span className="text-[13px] text-ink-muted">
          <b style={{ color: data.stuck ? "rgb(var(--tone-stuck-ink))" : undefined }}>
            {data.stuck} {t("eng.stuck")}
          </b>
          {" · "}
          {data.visitsToday} {t("eng.visit")}
        </span>
      </div>

      <div ref={ref} className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 96 96" className="-rotate-90">
          <circle cx="48" cy="48" r="40" fill="none" stroke="rgb(var(--surface-soft))" strokeWidth="10" />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke={DONE}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${seen ? (pct / 100) * c : 0} ${c}`}
            style={{ transition: "stroke-dasharray 1300ms cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center text-lg font-semibold leading-tight text-ink">
          <CountUp value={pct} format={(n) => `${Math.round(n)}%`} />
          <span className="text-[10px] font-medium text-ink-muted">
            {data.doneWeek} {t("eng.doneWeek")}
          </span>
        </span>
      </div>

      <div className="hidden w-full flex-col gap-2 sm:flex">
        <div className="flex h-[90px] items-end gap-2.5">
          {data.closedPerDay.map((d, i) => (
            <div key={d.date} className="flex h-full flex-1 flex-col justify-end gap-1.5">
              <span
                className="block origin-bottom rounded-[10px]"
                title={String(d.n)}
                style={{
                  height: `${Math.max(8, (d.n / max) * 100)}%`,
                  background: d.n ? (d.date === today ? "rgb(var(--tone-warn))" : DONE) : "rgb(var(--surface-soft))",
                  transform: seen ? "scaleY(1)" : "scaleY(0)",
                  transition: `transform 700ms cubic-bezier(.3,1.2,.4,1) ${i * 70}ms`,
                }}
              />
              <span className={`text-center text-xs ${d.date === today ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {d.date === today ? t("head.today") : wd(d.date)}
              </span>
            </div>
          ))}
        </div>
        <span className="text-xs text-ink-muted">{t("eng.closedPerDay")}</span>
      </div>
    </section>
  );
}

/* ---------------------------------- Visit --------------------------------- */

function Visit({ data, locale }: { data: EngineerData; locale: string }) {
  const t = useT();
  const v = data.visitToday;
  const now = new Date();
  const mon = now.toLocaleDateString(locale, { month: "short" }).replace(".", "").toUpperCase();
  return (
    <Link
      href={v ? `/agreements/${v.agreement_id}/edit` : "/agreements"}
      className="group flex h-full flex-col justify-between gap-5 rounded-[28px] bg-ink p-5 text-surface transition duration-300 hover:-translate-y-1 hover:shadow-pop active:scale-[0.98] sm:rounded-[32px] sm:p-7"
    >
      <span className="flex items-center justify-between text-sm opacity-80 sm:text-[15px]">
        {t("eng.visitToday")}
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-white transition duration-300 group-hover:rotate-45"
          style={{ background: DONE }}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </span>
      </span>
      {v ? (
        <span className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[16px] bg-surface/25 leading-[1.05]">
            <span className="text-[10px] font-bold tracking-widest opacity-70">{mon}</span>
            <span className="text-2xl font-semibold">{now.getDate()}</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xl font-semibold tracking-tight sm:text-2xl">{v.name}</span>
            <span className="block truncate text-[13px] opacity-75">{v.sub}</span>
          </span>
        </span>
      ) : (
        <span className="text-lg font-medium opacity-80">{t("eng.noVisitToday")}</span>
      )}
      <span className="text-[13px] opacity-75">
        {data.nextVisits[0]
          ? `${t("dash.nextVisit")}: ${data.nextVisits[0].name}`
          : t("dash.noUpcoming")}
      </span>
    </Link>
  );
}

/* -------------------------------- Task card ------------------------------- */

function TaskCard({ task }: { task: EngineerTask }) {
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
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
      style={{ gridTemplateRows: hidden ? "0fr" : "1fr", opacity: hidden ? 0 : 1 }}
    >
      <div className="overflow-hidden">
        <div className={`${CARD} flex flex-col gap-3.5 rounded-3xl p-4 sm:p-[18px]`}>
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[task.status] }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">{task.title}</span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">
                <span style={task.status === "stuck" ? { color: "rgb(var(--tone-stuck-ink))", fontWeight: 600 } : undefined}>
                  {t(statusKey(task.status))}
                </span>
                {task.parts > 0 && ` · ${task.parts} ${task.parts === 1 ? t("head.part") : t("head.parts")}`}
                {` · ${t(priorityKey(task.priority))}`}
              </span>
            </span>
          </div>
          {error && <p className="text-xs text-[rgb(var(--tone-stuck-ink))]">{t("eng.failed")}</p>}
          <div className="flex gap-2">
            <Link
              href="/tasks"
              className="flex min-h-[46px] flex-1 items-center justify-center rounded-full bg-surface-soft text-sm font-semibold text-ink transition active:scale-95"
            >
              {t("eng.open")}
            </Link>
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              className="flex min-h-[46px] flex-[1.3] items-center justify-center rounded-full text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
              style={{ background: DONE }}
            >
              {pending ? "…" : t("eng.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Up for grabs ------------------------------ */

function GrabRow({
  id,
  title,
  priority,
  profileId,
}: {
  id: string;
  title: string;
  priority: TaskPriority;
  profileId: string;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState(false);
  const claim = () =>
    start(async () => {
      setError(false);
      const r = await addAssignee(id, profileId);
      if ("error" in r && r.error) return setError(true);
      setClaimed(true);
    });
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
      style={{ gridTemplateRows: claimed ? "0fr" : "1fr", opacity: claimed ? 0 : 1 }}
    >
      <div className="overflow-hidden">
        <div className="flex items-center gap-3 border-t border-surface-border py-2.5 first:border-t-0">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{title}</span>
            <span
              className="block text-xs"
              style={{ color: error ? "rgb(var(--tone-stuck-ink))" : priority === "high" ? "rgb(var(--tone-stuck-ink))" : "rgb(var(--ink-muted))" }}
            >
              {error ? t("eng.failed") : t(priorityKey(priority))}
            </span>
          </span>
          <button
            type="button"
            onClick={claim}
            disabled={pending}
            className="flex min-h-[44px] shrink-0 items-center rounded-full border-[1.5px] border-ink px-4 text-[13px] font-semibold text-ink transition active:scale-95 disabled:opacity-60"
          >
            {pending ? "…" : t("eng.claim")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Grabs({ data }: { data: EngineerData }) {
  const t = useT();
  return (
    <section className={`${CARD} p-5 sm:p-[22px]`}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{t("eng.grabs")}</h2>
        <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-ink">{data.grabsTotal}</span>
      </div>
      {data.grabs.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">{t("eng.noGrabs")}</p>
      ) : (
        data.grabs.map((g) => (
          <GrabRow key={g.id} id={g.id} title={g.title} priority={g.priority} profileId={data.profileId} />
        ))
      )}
    </section>
  );
}

/* ------------------------------ Next visits ------------------------------ */

function NextVisits({ data, locale }: { data: EngineerData; locale: string }) {
  const t = useT();
  return (
    <section className={`${CARD} p-5 sm:p-[22px]`}>
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
