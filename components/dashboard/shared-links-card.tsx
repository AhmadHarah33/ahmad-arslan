"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBrandGoogleDrive,
  IconDatabase,
  IconDeviceDesktop,
  IconFileText,
  IconFolder,
  IconLink,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useT } from "@/lib/i18n/provider";
import { LINK_ICONS, type SharedLink } from "@/lib/shared-links";
import { addSharedLink, deleteSharedLink } from "@/app/(app)/shared-links/actions";
import { toastErr } from "@/lib/toast";

// The Shared drives card. Everyone sees the links; people who may edit shared
// data get an Edit button to add and remove them.

const ICONS = {
  folder: IconFolder,
  drive: IconBrandGoogleDrive,
  database: IconDatabase,
  desktop: IconDeviceDesktop,
  file: IconFileText,
  link: IconLink,
} as const;

function LinkIconGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? IconLink;
  return <Icon className={className} stroke={1.8} aria-hidden />;
}

export default function SharedLinksCard({ links, canEdit }: { links: SharedLink[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [items, setItems] = useState(links);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [icon, setIcon] = useState<string>("folder");

  function resetForm() {
    setTitle("");
    setUrl("");
    setNote("");
    setIcon("folder");
    setError(null);
    setAdding(false);
  }

  async function add() {
    setBusy(true);
    setError(null);
    const res = await addSharedLink({ title, url, note, icon });
    setBusy(false);
    if ("error" in res && res.error) return setError(res.error);
    if ("link" in res && res.link) setItems((prev) => [...prev, res.link as SharedLink]);
    resetForm();
    router.refresh();
  }

  async function remove(link: SharedLink) {
    if (!confirm(t("links.removeConfirm"))) return;
    const before = items;
    setItems((prev) => prev.filter((l) => l.id !== link.id));
    const res = await deleteSharedLink(link.id);
    if (res && "error" in res && res.error) {
      setItems(before);
      return toastErr(res.error);
    }
    router.refresh();
  }

  const row = "flex min-h-[56px] items-center gap-3 rounded-2xl bg-surface-soft px-3 py-2";
  const iconBox =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-ink transition duration-300";

  return (
    <div className="dark-card flex h-full flex-col gap-3 rounded-[28px] border border-surface-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{t("dash.resources")}</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v);
              if (editing) resetForm();
            }}
            className="flex min-h-[36px] items-center rounded-full bg-surface-soft px-3.5 text-xs font-semibold text-ink transition hover:opacity-80 active:scale-95"
          >
            {editing ? t("links.finish") : t("links.edit")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && <p className="py-4 text-center text-sm text-ink-faint">{t("links.empty")}</p>}
        {items.map((l) =>
          editing ? (
            <div key={l.id} className={row}>
              <span className={iconBox}>
                <LinkIconGlyph name={l.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{l.title}</span>
                <span className="block truncate text-xs text-ink-muted">{l.note || l.url}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(l)}
                aria-label={t("links.remove")}
                title={t("links.remove")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-[rgb(var(--tone-stuck-ink))]"
              >
                <IconTrash className="h-[18px] w-[18px]" stroke={1.8} />
              </button>
            </div>
          ) : (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group ${row} transition duration-300 hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.99]`}
            >
              <span className={`${iconBox} group-hover:bg-ink group-hover:text-surface`}>
                <LinkIconGlyph name={l.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{l.title}</span>
                {l.note && <span className="block truncate text-xs text-ink-muted">{l.note}</span>}
              </span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted transition duration-300 group-hover:rotate-45 group-hover:text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </a>
          )
        )}
      </div>

      {editing && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-border text-sm font-semibold text-ink-muted transition hover:text-ink active:scale-[0.99]"
        >
          <IconPlus className="h-4 w-4" stroke={2} />
          {t("links.add")}
        </button>
      )}

      {editing && adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="flex flex-col gap-3 rounded-2xl bg-surface-soft p-3"
        >
          <label className="block">
            <span className="label">{t("links.name")}</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} autoFocus />
          </label>
          <label className="block">
            <span className="label">{t("links.address")}</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://" maxLength={600} />
          </label>
          <label className="block">
            <span className="label">{t("links.note")}</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
          </label>
          <div>
            <span className="label">{t("links.icon")}</span>
            <div className="flex flex-wrap gap-2">
              {LINK_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  aria-pressed={icon === name}
                  aria-label={name}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-ink transition active:scale-95 ${icon === name ? "ring-2 ring-ink" : "opacity-70 hover:opacity-100"}`}
                >
                  <LinkIconGlyph name={name} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          {error && <p className="alert-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={resetForm} disabled={busy}>
              {t("profile.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !title.trim() || !url.trim()}>
              {busy ? "…" : t("links.add")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
