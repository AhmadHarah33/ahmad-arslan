"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PREVIEW } from "@/lib/preview";
import { formatDate } from "@/lib/dates";
import { saveSchedule, deleteSchedule } from "@/app/(app)/customers/maintenance-actions";
import { useAction } from "@/lib/use-action";

type Schedule = {
  id: string;
  title: string;
  interval_months: number;
  next_due: string;
  active: boolean;
};

function inMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Preventive-maintenance schedules for a customer. Due schedules auto-create
// tasks when the app is opened (see generate_due_maintenance()).
export default function Maintenance({
  customerId,
  editable,
}: {
  customerId: string;
  editable: boolean;
}) {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [title, setTitle] = useState("Preventive maintenance");
  const [interval, setInterval] = useState(6);
  const [nextDue, setNextDue] = useState(inMonths(6));

  useEffect(() => {
    let active = true;
    async function load() {
      if (PREVIEW) {
        setRows([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("maintenance_schedules")
        .select("id, title, interval_months, next_due, active")
        .eq("customer_id", customerId)
        .order("next_due");
      if (active) setRows((data ?? []) as Schedule[]);
    }
    load();
    return () => {
      active = false;
    };
  }, [customerId]);

  const { run: submitSchedule, pending: busy } = useAction(saveSchedule, {
    onSuccess: () =>
      setRows((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          title,
          interval_months: Number(interval) || 6,
          next_due: nextDue,
          active: true,
        },
      ]),
  });
  const { run: removeSchedule } = useAction(deleteSchedule);

  function add() {
    submitSchedule(null, {
      customer_id: customerId,
      title,
      interval_months: Number(interval) || 6,
      next_due: nextDue,
      active: true,
    });
  }

  async function remove(id: string) {
    const res = await removeSchedule(id);
    if (res) setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-ink-faint">No maintenance scheduled.</p>
      )}
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between rounded-lg bg-surface-soft px-3 py-2"
        >
          <span className="text-sm text-ink">
            {r.title}{" "}
            <span className="text-ink-faint">
              · every {r.interval_months}mo · next {formatDate(r.next_due)}
            </span>
          </span>
          {editable && (
            <button onClick={() => remove(r.id)} className="text-xs text-red-500">
              remove
            </button>
          )}
        </div>
      ))}

      {editable && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            className="input col-span-2 sm:col-span-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <input
            type="number"
            min={1}
            className="input"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            title="Interval (months)"
          />
          <input
            type="date"
            className="input"
            value={nextDue}
            onChange={(e) => setNextDue(e.target.value)}
          />
          <button className="btn-ghost sm:col-span-1" onClick={add} disabled={busy}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
