"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PREVIEW,
  previewCustomers,
  previewSpareParts,
  previewTasks,
} from "@/lib/preview";

type Hit = {
  kind: "customer" | "part" | "task";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const KIND_LABEL = { customer: "Customers", part: "Spare parts", task: "Tasks" };

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      return;
    }
    let active = true;
    const run = async () => {
      const results = PREVIEW ? previewSearch(term) : await liveSearch(term);
      if (active) setHits(results);
    };
    const t = setTimeout(run, PREVIEW ? 0 : 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  const grouped = useMemo(() => {
    const g: Record<string, Hit[]> = { customer: [], part: [], task: [] };
    for (const h of hits) g[h.kind].push(h);
    return g;
  }, [hits]);

  if (!open) return null;

  function go(h: Hit) {
    onClose();
    router.push(h.href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[10vh]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-pop">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customers, parts, tasks…"
          className="w-full border-b border-surface-border bg-surface px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {q.trim() && hits.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">
              No matches for “{q.trim()}”.
            </p>
          )}
          {(["customer", "part", "task"] as const).map((kind) =>
            grouped[kind].length > 0 ? (
              <div key={kind} className="mb-1">
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {KIND_LABEL[kind]}
                </p>
                {grouped[kind].map((h) => (
                  <button
                    key={`${h.kind}-${h.id}`}
                    onClick={() => go(h)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {h.title}
                      </span>
                      {h.subtitle && (
                        <span className="block truncate text-xs text-ink-faint">
                          {h.subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : null
          )}
          {!q.trim() && (
            <p className="px-3 py-6 text-center text-xs text-ink-faint">
              Type to search across everything.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function previewSearch(term: string): Hit[] {
  const t = term.toLowerCase();
  const hits: Hit[] = [];
  for (const c of previewCustomers)
    if (
      [c.name, c.location, c.machine, c.serial_number]
        .join(" ")
        .toLowerCase()
        .includes(t)
    )
      hits.push({
        kind: "customer",
        id: c.id,
        title: c.name,
        subtitle: c.serial_number,
        href: `/customers?q=${encodeURIComponent(c.name)}`,
      });
  for (const p of previewSpareParts)
    if ([p.name, p.part_number].join(" ").toLowerCase().includes(t))
      hits.push({
        kind: "part",
        id: p.id,
        title: p.name,
        subtitle: p.part_number,
        href: `/spare-parts?q=${encodeURIComponent(p.name)}`,
      });
  for (const k of previewTasks)
    if (k.title.toLowerCase().includes(t))
      hits.push({ kind: "task", id: k.id, title: k.title, href: `/tasks` });
  return hits.slice(0, 20);
}

async function liveSearch(term: string): Promise<Hit[]> {
  const supabase = createClient();
  const like = `%${term}%`;
  const [{ data: cs }, { data: ps }, { data: ts }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, serial_number")
      .or(
        `name.ilike.${like},serial_number.ilike.${like},location.ilike.${like},machine.ilike.${like}`
      )
      .limit(6),
    supabase
      .from("spare_parts")
      .select("id, name, part_number")
      .or(`name.ilike.${like},part_number.ilike.${like}`)
      .limit(6),
    supabase.from("tasks").select("id, title").ilike("title", like).limit(6),
  ]);
  const hits: Hit[] = [];
  for (const c of cs ?? [])
    hits.push({
      kind: "customer",
      id: c.id,
      title: c.name,
      subtitle: c.serial_number ?? undefined,
      href: `/customers?q=${encodeURIComponent(c.name)}`,
    });
  for (const p of ps ?? [])
    hits.push({
      kind: "part",
      id: p.id,
      title: p.name,
      subtitle: p.part_number ?? undefined,
      href: `/spare-parts?q=${encodeURIComponent(p.name)}`,
    });
  for (const t of ts ?? [])
    hits.push({ kind: "task", id: t.id, title: t.title, href: `/tasks` });
  return hits;
}
