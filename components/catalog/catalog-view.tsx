"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { City, Company, MachineModel, Profile } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import {
  createBrand,
  createCity,
  createModel,
  deleteBrand,
  deleteCity,
  deleteModel,
  renameBrand,
  renameCity,
  renameModel,
} from "@/app/(app)/catalog/actions";

type Row = { id: string; name: string };

export default function CatalogView({
  profile,
  companies,
  models,
  cities,
}: {
  profile: Profile;
  companies: Company[];
  models: MachineModel[];
  cities: City[];
}) {
  const t = useT();
  const router = useRouter();
  const manager = isManager(profile);
  // Which brand's models are expanded. Brands usually have a handful of
  // models each, so showing all of them at once is noise.
  const [openBrand, setOpenBrand] = useState<string | null>(
    companies[0]?.id ?? null
  );

  async function run(fn: () => Promise<{ error?: string } | void>) {
    const res = await fn();
    if (res && "error" in res && res.error) return toastErr(res.error);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("catalog.title")} subtitle={t("catalog.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Brands, each expanding to its own models. */}
        <section className="card p-4">
          <SectionHead title={t("catalog.brands")} count={companies.length} />

          <div className="mt-3 space-y-1">
            {companies.length === 0 && <Empty text={t("catalog.noBrands")} />}
            {companies.map((c) => {
              const own = models.filter((m) => m.company_id === c.id);
              const open = openBrand === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-surface-border">
                  <div className="flex items-center gap-1 px-1">
                    <button
                      onClick={() => setOpenBrand(open ? null : c.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2.5 text-left"
                    >
                      <ChevronIcon
                        className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                      <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                      <span className="shrink-0 text-xs text-ink-faint">{own.length}</span>
                    </button>
                    {manager && (
                      <RowActions
                        name={c.name}
                        onRename={(v) => run(() => renameBrand(c.id, v))}
                        onDelete={() =>
                          confirm(t("catalog.confirmDeleteBrand")) &&
                          run(() => deleteBrand(c.id))
                        }
                      />
                    )}
                  </div>

                  {open && (
                    <div className="space-y-1 border-t border-surface-border p-2">
                      {own.length === 0 && (
                        <p className="px-1 py-1 text-xs text-ink-faint">
                          {t("catalog.noModels")}
                        </p>
                      )}
                      {own.map((m) => (
                        <ListRow
                          key={m.id}
                          name={m.name}
                          manager={manager}
                          onRename={(v) => run(() => renameModel(m.id, v))}
                          onDelete={() =>
                            confirm(t("catalog.confirmDeleteModel")) &&
                            run(() => deleteModel(m.id))
                          }
                        />
                      ))}
                      <AddRow
                        label={t("catalog.addModel")}
                        onAdd={(v) => run(() => createModel(c.id, v))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2">
            <AddRow label={t("catalog.addBrand")} onAdd={(v) => run(() => createBrand(v))} />
          </div>
        </section>

        {/* Cities */}
        <section className="card p-4">
          <SectionHead title={t("catalog.cities")} count={cities.length} />
          <div className="mt-3 space-y-1">
            {cities.length === 0 && <Empty text={t("catalog.noCities")} />}
            {cities.map((c) => (
              <ListRow
                key={c.id}
                name={c.name}
                manager={manager}
                onRename={(v) => run(() => renameCity(c.id, v))}
                onDelete={() =>
                  confirm(t("catalog.confirmDeleteCity")) && run(() => deleteCity(c.id))
                }
              />
            ))}
          </div>
          <div className="mt-2">
            <AddRow label={t("catalog.addCity")} onAdd={(v) => run(() => createCity(v))} />
          </div>
        </section>
      </div>

      {!manager && (
        <p className="mt-4 text-xs text-ink-faint">{t("catalog.readOnlyNote")}</p>
      )}
    </div>
  );
}

function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <span className="text-xs text-ink-faint">{count}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-2 text-sm text-ink-faint">{text}</p>;
}

// One catalog entry: its name, and (for managers) rename/delete inline.
function ListRow({
  name,
  manager,
  onRename,
  onDelete,
}: {
  name: string;
  manager: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-soft">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{name}</span>
      {manager && <RowActions name={name} onRename={onRename} onDelete={onDelete} />}
    </div>
  );
}

function RowActions({
  name,
  onRename,
  onDelete,
}: {
  name: string;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (editing) {
    return (
      <div className="flex flex-1 gap-1">
        <input
          className="input h-8 flex-1 py-1 text-sm"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(draft);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          className="btn-primary h-8 shrink-0 px-2.5 text-xs"
          onClick={() => {
            onRename(draft);
            setEditing(false);
          }}
        >
          {t("common.save")}
        </button>
        <button
          className="btn-ghost h-8 shrink-0 px-2.5 text-xs"
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-soft hover:text-ink"
      >
        {t("common.edit")}
      </button>
      <button
        onClick={onDelete}
        aria-label={t("common.delete")}
        className="rounded-lg px-2 py-1 text-xs font-medium text-ink-faint hover:bg-surface-soft"
        style={{ color: "rgb(var(--tone-stuck-ink))" }}
      >
        ✕
      </button>
    </div>
  );
}

// Inline "+ Add" that turns into a field, so the page has no modals.
function AddRow({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-brand-600 hover:bg-surface-soft"
      >
        ＋ {label}
      </button>
    );
  }

  return (
    <div className="flex gap-1">
      <input
        className="input h-8 flex-1 py-1 text-sm"
        value={draft}
        autoFocus
        placeholder={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button className="btn-primary h-8 shrink-0 px-2.5 text-xs" onClick={submit}>
        {t("common.add")}
      </button>
      <button
        className="btn-ghost h-8 shrink-0 px-2.5 text-xs"
        onClick={() => setOpen(false)}
      >
        ✕
      </button>
    </div>
  );
}

function ChevronIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
