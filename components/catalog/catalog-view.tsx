"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { City, Company, MachineModel, Profile } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import PageTools from "@/components/page-tools";
import StatCard from "@/components/stat-card";
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
  const [openBrand, setOpenBrand] = useState<string | null>(companies[0]?.id ?? null);
  // Phone: one panel at a time. On desktop both show.
  const [tab, setTab] = useState<"brands" | "cities">("brands");
  const [addingBrand, setAddingBrand] = useState(false);

  async function run(fn: () => Promise<{ error?: string } | void>) {
    const res = await fn();
    if (res && "error" in res && res.error) return toastErr(res.error);
    router.refresh();
  }

  const panel = "rounded-[22px] bg-surface p-4 md:p-[18px]";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
            {t("catalog.title")}
          </h1>
          <span className="text-[13px] text-ink-muted">{t("catalog.subtitle")}</span>
        </div>
        <PageTools />
      </div>

      {/* Stat cards */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard value={companies.length} label={t("catalog.statBrands")} />
        <StatCard value={models.length} label={t("catalog.statModels")} />
        <StatCard value={cities.length} label={t("catalog.cities")} />
      </section>

      {/* Phone tabs */}
      <div role="tablist" className="seg self-start lg:hidden">
        {(
          [
            ["brands", t("catalog.statBrands"), companies.length],
            ["cities", t("catalog.cities"), cities.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`seg-btn ${tab === id ? "seg-btn-on" : ""}`}
          >
            {label}
            <span className="text-xs font-normal text-ink-faint">{n}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Brands, each expanding to its own models. */}
        <section
          aria-label={t("catalog.brands")}
          className={`${panel} flex-col gap-2.5 ${tab === "brands" ? "flex" : "hidden"} lg:flex`}
        >
          <div className="flex items-center justify-between px-1 pb-1">
            <h2 className="text-[17px] font-bold text-ink">{t("catalog.brands")}</h2>
            <button
              onClick={() => setAddingBrand((v) => !v)}
              className="h-10 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-surface transition hover:opacity-90"
            >
              + {t("catalog.addBrand")}
            </button>
          </div>

          {addingBrand && (
            <AddField
              placeholder={t("catalog.addBrand")}
              onAdd={(v) => {
                setAddingBrand(false);
                run(() => createBrand(v));
              }}
              onCancel={() => setAddingBrand(false)}
            />
          )}

          {companies.length === 0 && <Empty text={t("catalog.noBrands")} />}
          {companies.map((c) => {
            const own = models.filter((m) => m.company_id === c.id);
            const open = openBrand === c.id;
            return (
              <div
                key={c.id}
                className={`overflow-hidden rounded-2xl ${open ? "bg-surface-soft" : "bg-surface"} border border-surface-border`}
              >
                <div className="flex items-center gap-1 pr-2">
                  <button
                    onClick={() => setOpenBrand(open ? null : c.id)}
                    aria-expanded={open}
                    className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-surface-soft text-[13px] font-bold text-ink-muted">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-3">
                      <span className="truncate text-[15px] font-semibold text-ink">{c.name}</span>
                      <span className="text-xs text-ink-muted md:ml-auto">
                        {own.length} {t("catalog.models")}
                      </span>
                    </span>
                    <ChevronIcon
                      className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {manager && (
                    <RowActions
                      name={c.name}
                      onRename={(v) => run(() => renameBrand(c.id, v))}
                      onDelete={() =>
                        confirm(t("catalog.confirmDeleteBrand")) && run(() => deleteBrand(c.id))
                      }
                    />
                  )}
                </div>

                {open && (
                  <div className="flex flex-wrap items-center gap-2 px-3 pb-3.5 pt-0.5 md:pl-[62px]">
                    {own.length === 0 && (
                      <p className="mr-1 text-xs text-ink-muted">{t("catalog.noModels")}</p>
                    )}
                    {own.map((m) => (
                      <Chip
                        key={m.id}
                        name={m.name}
                        manager={manager}
                        onRename={(v) => run(() => renameModel(m.id, v))}
                        onDelete={() =>
                          confirm(t("catalog.confirmDeleteModel")) && run(() => deleteModel(m.id))
                        }
                      />
                    ))}
                    <AddChip
                      label={t("catalog.addModel")}
                      onAdd={(v) => run(() => createModel(c.id, v))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Cities */}
        <section
          aria-label={t("catalog.cities")}
          className={`${panel} flex-col gap-3.5 ${tab === "cities" ? "flex" : "hidden"} lg:flex`}
        >
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[17px] font-bold text-ink">{t("catalog.cities")}</h2>
            <span className="text-xs text-ink-muted">{cities.length}</span>
          </div>
          <AddField
            alwaysOpen
            placeholder={t("catalog.addCity")}
            onAdd={(v) => run(() => createCity(v))}
          />
          {cities.length === 0 && <Empty text={t("catalog.noCities")} />}
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <Chip
                key={c.id}
                name={c.name}
                manager={manager}
                icon={<PinIcon className="h-[13px] w-[13px] text-[rgb(var(--tone-done-ink))]" />}
                onRename={(v) => run(() => renameCity(c.id, v))}
                onDelete={() =>
                  confirm(t("catalog.confirmDeleteCity")) && run(() => deleteCity(c.id))
                }
              />
            ))}
          </div>
        </section>
      </div>

      {!manager && (
        <div className="flex items-center gap-2.5 rounded-[14px] bg-brand-50 px-4 py-3 text-[13px] text-brand-800">
          <InfoIcon className="h-4 w-4 shrink-0" />
          {t("catalog.readOnlyNote")}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-2 text-sm text-ink-muted">{text}</p>;
}

// A catalog entry as a chip: its name, and (for managers) tap to rename or
// delete in place.
function Chip({
  name,
  manager,
  icon,
  onRename,
  onDelete,
}: {
  name: string;
  manager: boolean;
  icon?: React.ReactNode;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (editing) {
    const save = () => {
      if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
      setEditing(false);
    };
    return (
      <div className="flex items-center gap-1">
        <input
          className="input !h-[38px] !w-40 !rounded-xl !px-3 !py-1 !text-sm"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={save}
          className="h-[38px] rounded-xl bg-ink px-3 text-xs font-semibold text-surface"
        >
          {t("common.save")}
        </button>
        <button
          onClick={onDelete}
          aria-label={t("common.delete")}
          className="h-[38px] rounded-xl px-2.5 text-xs font-semibold"
          style={{ color: "rgb(var(--tone-stuck-ink))" }}
        >
          {t("common.delete")}
        </button>
        <button
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
          aria-label="Cancel"
          className="h-[38px] rounded-xl px-2 text-xs text-ink-muted"
        >
          ✕
        </button>
      </div>
    );
  }

  const cls =
    "flex h-[38px] items-center gap-1.5 rounded-xl border border-surface-border bg-surface px-3.5 text-[13px] font-medium text-ink";
  return manager ? (
    <button
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title={t("common.edit")}
      className={`${cls} transition hover:border-ink-faint`}
    >
      {icon}
      {name}
    </button>
  ) : (
    <span className={cls}>
      {icon}
      {name}
    </span>
  );
}

// Brand-row Edit / Delete (managers).
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
    const save = () => {
      if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
      setEditing(false);
    };
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input
          className="input !h-9 !w-32 !rounded-xl !px-3 !py-1 !text-sm sm:!w-44"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button onClick={save} className="h-9 rounded-xl bg-ink px-3 text-xs font-semibold text-surface">
          {t("common.save")}
        </button>
        <button
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
          className="h-9 rounded-xl px-2 text-xs text-ink-muted"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-soft hover:text-ink"
      >
        {t("common.edit")}
      </button>
      <button
        onClick={onDelete}
        className="rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-surface-soft hover:underline"
        style={{ color: "rgb(var(--tone-stuck-ink))" }}
      >
        {t("common.delete")}
      </button>
    </div>
  );
}

// Full-width input + Add button (new brand, new city).
function AddField({
  placeholder,
  onAdd,
  onCancel,
  alwaysOpen = false,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
  onCancel?: () => void;
  alwaysOpen?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  function submit() {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  }
  return (
    <div className="flex gap-2">
      <input
        className="input !h-11 min-w-0 flex-1 !rounded-xl !py-0"
        value={draft}
        autoFocus={!alwaysOpen}
        placeholder={`${placeholder}…`}
        aria-label={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel?.();
        }}
      />
      <button
        onClick={submit}
        className="h-11 shrink-0 rounded-xl bg-ink px-4 text-[13px] font-semibold text-surface transition hover:opacity-90"
      >
        {t("common.add")}
      </button>
      {onCancel && (
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="h-11 shrink-0 rounded-xl px-2.5 text-ink-muted"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Dashed "+ Add model" chip that turns into a small field.
function AddChip({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
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
        className="h-[38px] rounded-xl border-[1.5px] border-dashed border-ink-faint px-3.5 text-[13px] font-semibold text-brand-600 transition hover:bg-surface"
      >
        + {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        className="input !h-[38px] !w-40 !rounded-xl !px-3 !py-1 !text-sm"
        value={draft}
        autoFocus
        placeholder={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button onClick={submit} className="h-[38px] rounded-xl bg-ink px-3 text-xs font-semibold text-surface">
        {t("common.add")}
      </button>
      <button
        onClick={() => setOpen(false)}
        aria-label="Cancel"
        className="h-[38px] rounded-xl px-2 text-xs text-ink-muted"
      >
        ✕
      </button>
    </div>
  );
}

function ChevronIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function PinIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
function InfoIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
