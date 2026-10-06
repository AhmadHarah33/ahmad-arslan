"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dates";
import { useT } from "@/lib/i18n/provider";
import type { AgreementPlan, AgreementStatus } from "@/lib/types";

type Row = {
  id: string;
  plan: AgreementPlan;
  status: AgreementStatus;
  start_date: string;
  end_date: string;
  next_visit: string | null;
};

const PLAN_TONE: Record<AgreementPlan, string> = {
  periodic: "tone-progress",
  annual: "tone-purple",
  warranty: "tone-orange",
};

// A customer's service agreements (Bakım & Garanti), read-only, each linking
// to its edit page, plus a shortcut to open a new one for this customer.
export default function CustomerAgreements({ customerId }: { customerId: string }) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .from("agreement_overview")
      .select("id, plan, status, start_date, end_date, next_visit")
      .eq("customer_id", customerId)
      .neq("status", "cancelled")
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        if (active) setRows((data ?? []) as Row[]);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  return (
    <div className="space-y-2">
      {rows && rows.length === 0 && (
        <p className="text-sm text-ink-faint">{t("customers.noAgreements")}</p>
      )}
      {(rows ?? []).map((r) => (
        <Link
          key={r.id}
          href={`/agreements/${r.id}/edit`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-soft px-3 py-2 text-sm hover:opacity-80"
        >
          <span className={`${PLAN_TONE[r.plan]} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
            {t(`ag.type.${r.plan}` as const)}
          </span>
          <span className="text-ink">
            {formatDate(r.start_date)} – {formatDate(r.end_date)}
          </span>
          <span className="ml-auto text-xs text-ink-faint">
            {t(`ag.status.${r.status}` as const)}
            {r.next_visit && r.status === "active"
              ? ` · ${t("ag.next")} ${formatDate(r.next_visit)}`
              : ""}
          </span>
        </Link>
      ))}
      <Link
        href={`/agreements/new?customer=${customerId}`}
        className="inline-block text-sm font-medium text-brand-600"
      >
        + {t("ag.new")}
      </Link>
    </div>
  );
}
