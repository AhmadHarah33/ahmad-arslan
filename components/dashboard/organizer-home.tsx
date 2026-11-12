"use client";

import Link from "next/link";
import { useLanguage, useT } from "@/lib/i18n/provider";
import type { OrganizerData } from "@/lib/dashboard.organizer";
import type { SharedLink } from "@/lib/shared-links";
import { CountUp, Reveal, useInView } from "@/components/dashboard/motion";
import { Attention, CARD, DataCard } from "@/components/dashboard/head-home";

// Home screen for the Organizer: the approvals queue first (approving deducts
// stock and unblocks engineers), then payments, visits, warranty and stock.
// Same look and motion as the Head screen; on a phone it stacks in this order.

const DONE = "rgb(var(--tone-done))";
const WARN = "rgb(var(--tone-warn))";
const STUCK = "rgb(var(--tone-stuck))";

export default function OrganizerHome({
  greeting,
  today,
  data,
  links,
  canEditLinks,
}: {
  greeting: { hello: string; name: string };
  today: string;
  data: OrganizerData;
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
  const money = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const first = data.overdue.money[0];

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-muted sm:text-[13px]">{eyebrow}</p>
            <h1 className="text-[28px] font-medium tracking-tight text-ink sm:text-4xl">
              {greeting.hello}, <span className="text-ink-faint">{greeting.name}</span>
            </h1>
          </div>
          <Link
            href="/agreements/new"
            className="btn-primary min-h-[48px] rounded-full px-5 transition active:scale-95"
          >
            <span aria-hidden className="text-lg leading-none">
              +
            </span>
            {t("dash.newAgreement")}
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1.05fr_1.4fr]">
        <Reveal delay={80}>
          <Queue data={data} />
        </Reveal>
        <Reveal delay={160}>
          <Collected data={data} money={money} locale={locale} />
        </Reveal>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Reveal delay={120}>
          <Attention
            href="/agreements"
            label={t("org.overduePayments")}
            value={
              first ? (
                <CountUp
                  value={first.amount}
                  decimals={2}
                  mutedDecimals
                  prefix={first.symbol}
                  format={money}
                />
              ) : (
                <CountUp value={0} decimals={2} mutedDecimals prefix="€" format={money} />
              )
            }
            foot={
              <>
                <b className={data.overdue.count ? "text-[rgb(var(--tone-stuck-ink))]" : ""}>
                  {data.overdue.count}
                </b>{" "}
                {t("head.agreements")}
              </>
            }
          />
        </Reveal>
        <Reveal delay={180}>
          <Attention
            href="/agreements"
            label={t("org.visitsWeek")}
            value={<CountUp value={data.visitsWeek.total} decimals={1} mutedDecimals />}
            foot={
              <>
                <b className={data.visitsWeek.late ? "text-[rgb(var(--tone-stuck-ink))]" : ""}>
                  {data.visitsWeek.late}
                </b>{" "}
                {t("org.late")}
              </>
            }
          />
        </Reveal>
        <Reveal delay={240}>
          <Attention
            href="/agreements"
            label={t("dash.warrantyEnding")}
            value={<CountUp value={data.warrantyEnding} decimals={1} mutedDecimals />}
            foot={t("org.within30")}
          />
        </Reveal>
        <Reveal delay={300}>
          <Attention
            href="/spare-parts"
            label={t("dash.lowStock")}
            value={<CountUp value={data.lowStock.count} decimals={1} mutedDecimals />}
            foot={
              <>
                <b className={data.lowStock.out ? "text-[rgb(var(--tone-stuck-ink))]" : ""}>
                  {data.lowStock.out}
                </b>{" "}
                {t("org.outOfStock")}
              </>
            }
          />
        </Reveal>
        <Reveal delay={360} className="col-span-2 xl:col-span-1">
          <DataCard links={links} canEdit={canEditLinks} />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <Reveal delay={120} className="lg:col-span-2 xl:col-span-1">
          <Stock data={data} />
        </Reveal>
        <Reveal delay={200}>
          <ComingUp data={data} locale={locale} />
        </Reveal>
        <Reveal delay={280}>
          <Chase data={data} money={money} locale={locale} />
        </Reveal>
      </div>
    </div>
  );
}

/* ----------------------------- Approvals queue ---------------------------- */

function Queue({ data }: { data: OrganizerData }) {
  const t = useT();
  return (
    <section className="inv flex h-full flex-col gap-4 rounded-[28px] bg-ink p-5 text-surface sm:rounded-[32px] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="block text-sm opacity-75 sm:text-[15px]">{t("head.waitingApproval")}</span>
          <CountUp
            value={data.approvalsTotal}
            decimals={1}
            mutedDecimals
            className="text-[64px] font-semibold leading-[0.95] tracking-[-0.05em] sm:text-[88px] [&_.text-ink-faint]:text-surface [&_.text-ink-faint]:opacity-45"
          />
        </div>
        {data.approvalsTotal > 0 && (
          <span className="rounded-full bg-[rgb(var(--tone-warn)/0.25)] px-3.5 py-1.5 text-xs font-bold text-[rgb(var(--tone-warn))] sm:text-[13px]">
            {t("head.stockPending")}
          </span>
        )}
      </div>
      {data.approvals.length === 0 ? (
        <p className="py-6 text-center text-sm opacity-70">{t("head.allClear")}</p>
      ) : (
        <div className="flex flex-col">
          {data.approvals.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-t border-surface/25 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{a.title}</span>
                <span className="block truncate text-[13px] opacity-70">{a.people}</span>
              </span>
              {a.parts > 0 && (
                <span className="shrink-0 rounded-full border border-surface/35 px-3 py-1 text-xs">
                  {a.parts} {a.parts === 1 ? t("head.part") : t("head.parts")}
                </span>
              )}
              <Link
                href="/tasks"
                className="done-btn flex min-h-[44px] shrink-0 items-center rounded-full px-5 text-sm font-semibold transition active:scale-95"
              >
                {t("head.review")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------- Payments collected --------------------------- */

function Collected({
  data,
  money,
  locale,
}: {
  data: OrganizerData;
  money: (n: number) => string;
  locale: string;
}) {
  const t = useT();
  const [ref, seen] = useInView<HTMLDivElement>();
  const c = data.collected;
  const max = Math.max(1, ...c.months.map((m) => m.paid + m.due + m.overdue));
  const label = (key: string) =>
    new Date(`${key}-01T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", month: "short" });

  return (
    <section className={`${CARD} flex h-full flex-col gap-5 p-5 sm:rounded-[32px] sm:p-7`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm text-ink-muted sm:text-[15px]">{t("org.collected")}</span>
          <div className="flex flex-wrap items-end gap-3">
            <CountUp
              value={c.paid}
              decimals={2}
              mutedDecimals
              prefix={c.symbol}
              format={money}
              className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[60px]"
            />
            {c.pct != null && (
              <span
                className="mb-1 flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1 text-[13px] font-semibold"
                style={{ color: "rgb(var(--tone-done-ink))" }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
                </svg>
                {c.pct}% {t("org.paidShare")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3.5 text-[13px] text-ink-muted">
          {[
            [t("org.paid"), DONE],
            [t("org.dueSoon"), WARN],
            [t("org.overdue"), STUCK],
          ].map(([name, color]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {name}
            </span>
          ))}
        </div>
      </div>

      <div ref={ref} className="flex h-[150px] items-end gap-2.5 sm:gap-3">
        {c.months.map((m, i) => {
          const parts = [
            { v: m.overdue, color: STUCK },
            { v: m.due, color: WARN },
            { v: m.paid, color: DONE },
          ];
          const isNow = i === c.months.length - 1;
          return (
            <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
              <div className="flex flex-1 flex-col justify-end gap-[3px]">
                {parts.map(
                  (p, j) =>
                    p.v > 0 && (
                      <span
                        key={j}
                        className="block w-full origin-bottom rounded-[10px]"
                        title={money(p.v)}
                        style={{
                          height: `${(p.v / max) * 100}%`,
                          minHeight: 6,
                          background: p.color,
                          transform: seen ? "scaleY(1)" : "scaleY(0)",
                          transition: `transform 800ms cubic-bezier(.3,1.2,.4,1) ${i * 90 + j * 60}ms`,
                        }}
                      />
                    )
                )}
              </div>
              <span className={`text-center text-xs ${isNow ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {label(m.key)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------- Low stock ------------------------------- */

function Stock({ data }: { data: OrganizerData }) {
  const t = useT();
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <section className={`${CARD} flex h-full flex-col gap-1 p-5 sm:p-[22px]`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{t("dash.lowStock")}</h2>
        <Link href="/spare-parts" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink-muted hover:text-ink">
          {t("org.orderList")} ›
        </Link>
      </div>
      {data.lowStock.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">{t("dash.allStocked")}</p>
      ) : (
        <div ref={ref}>
          {data.lowStock.items.map((p, i) => {
            const out = p.qty <= 0;
            const frac = Math.min(1, Math.max(0.04, p.qty / Math.max(1, p.min)));
            return (
              <Link
                key={p.id}
                href="/spare-parts"
                className="flex items-center gap-3 border-t border-surface-border py-3 transition first:border-t-0 hover:opacity-80"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{p.sub}</span>
                </span>
                <span className="hidden h-2 w-20 shrink-0 overflow-hidden rounded-full bg-surface-soft sm:block">
                  <span
                    className="block h-full origin-left rounded-full"
                    style={{
                      width: `${frac * 100}%`,
                      background: out ? STUCK : WARN,
                      transform: seen ? "scaleX(1)" : "scaleX(0)",
                      transition: `transform 900ms cubic-bezier(.4,0,.2,1) ${i * 100}ms`,
                    }}
                  />
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{
                    background: out ? "rgb(var(--tone-stuck) / 0.12)" : "rgb(var(--tone-warn) / 0.16)",
                    color: out ? "rgb(var(--tone-stuck-ink))" : "rgb(var(--tone-warn-ink))",
                  }}
                >
                  {p.qty} {t("org.left")}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------- Coming up ------------------------------- */

function DateChip({ iso, locale, late }: { iso: string; locale: string; late?: boolean }) {
  const d = new Date(`${iso}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, { timeZone: "UTC", ...o });
  return (
    <span
      className="flex h-[46px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[14px] leading-[1.05]"
      style={
        late
          ? { background: "rgb(var(--tone-stuck) / 0.12)", color: "rgb(var(--tone-stuck-ink))" }
          : { background: "rgb(var(--surface-soft))" }
      }
    >
      <b className="text-base">{f({ day: "numeric" })}</b>
      <span className="text-[9px] font-bold uppercase">{f({ month: "short" }).replace(".", "")}</span>
    </span>
  );
}

function ComingUp({ data, locale }: { data: OrganizerData; locale: string }) {
  const t = useT();
  return (
    <section className={`${CARD} flex h-full flex-col gap-1 p-5 sm:p-[22px]`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{t("org.comingUp")}</h2>
        <Link href="/agreements" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink-muted hover:text-ink">
          {t("org.all")} ›
        </Link>
      </div>
      {data.comingUp.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">{t("dash.noUpcoming")}</p>
      ) : (
        data.comingUp.map((v) => (
          <Link
            key={v.key}
            href="/agreements"
            className="flex items-center gap-3 border-t border-surface-border py-2.5 transition first:border-t-0 hover:opacity-80"
          >
            <DateChip iso={v.date} locale={locale} late={v.late} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{v.name}</span>
              <span
                className="block truncate text-xs"
                style={{ color: v.late ? "rgb(var(--tone-stuck-ink))" : "rgb(var(--ink-muted))" }}
              >
                {v.sub}
              </span>
            </span>
          </Link>
        ))
      )}
    </section>
  );
}

/* --------------------------- Payments to chase --------------------------- */

function Chase({
  data,
  money,
  locale,
}: {
  data: OrganizerData;
  money: (n: number) => string;
  locale: string;
}) {
  const t = useT();
  const short = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    });
  return (
    <section className={`${CARD} flex h-full flex-col gap-1 p-5 sm:p-[22px]`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{t("org.chase")}</h2>
        <Link href="/agreements" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink-muted hover:text-ink">
          {t("org.all")} ›
        </Link>
      </div>
      {data.chase.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">{t("ag.noPayments")}</p>
      ) : (
        data.chase.map((p) => {
          const late = p.overdueDays != null;
          return (
            <Link
              key={p.id}
              href={`/agreements/${p.id}/edit`}
              className="flex items-center gap-3 border-t border-surface-border py-3 transition first:border-t-0 hover:opacity-80"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span
                  className="block truncate text-xs"
                  style={{ color: late ? "rgb(var(--tone-stuck-ink))" : "rgb(var(--tone-warn-ink))" }}
                >
                  {late
                    ? `${t("ag.overdueFor")} ${p.overdueDays} ${t("head.days")}`
                    : p.due
                      ? `${t("ag.dueOn")} ${short(p.due)}`
                      : t("ag.noDueDate")}
                </span>
              </span>
              <b className="shrink-0 text-[15px] tabular-nums text-ink">
                {p.symbol}
                {money(p.amount)}
              </b>
            </Link>
          );
        })
      )}
    </section>
  );
}
