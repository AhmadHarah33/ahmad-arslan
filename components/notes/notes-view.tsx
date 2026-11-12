"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { toastErr } from "@/lib/toast";
import {
  purgeNote,
  setNoteArchived,
  setNotePinned,
} from "@/app/(app)/notes/actions";
import type { Note } from "@/lib/notes";
import type { AssigneeLite } from "@/lib/types";
import NoteEditor, { type SavedFields } from "./note-editor";

// `key` keeps one editor mounted while a draft becomes a saved note; `id` is
// null until the first save creates the row.
type Selection = { key: string; id: string | null };

const norm = (s: string) => s.toLocaleLowerCase();

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 110);
}

function byPinnedThenRecent(a: Note, b: Note) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updated_at.localeCompare(a.updated_at);
}

export default function NotesView({
  initialNotes,
  users,
  tasks,
}: {
  initialNotes: Note[];
  users: AssigneeLite[];
  tasks: { id: string; title: string }[];
}) {
  const t = useT();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [sel, setSel] = useState<Selection | null>(null);
  const [draftSeq, setDraftSeq] = useState(0);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const selected = sel?.id ? notes.find((n) => n.id === sel.id) ?? null : null;

  // Every tag in use, one spelling each, for the filter bar and autocomplete.
  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of notes) {
      for (const tag of n.tags) if (!seen.has(norm(tag))) seen.set(norm(tag), tag);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return notes
      .filter((n) => (showArchive ? !!n.archived_at : !n.archived_at))
      .filter((n) => !tagFilter || n.tags.some((x) => norm(x) === norm(tagFilter)))
      .filter(
        (n) =>
          !q ||
          norm(n.title).includes(q) ||
          norm(n.body).includes(q) ||
          n.tags.some((x) => norm(x).includes(q)) ||
          n.mentions.some((m) => norm(m.label).includes(q))
      )
      .sort(byPinnedThenRecent);
  }, [notes, query, tagFilter, showArchive]);

  const pinned = visible.filter((n) => n.pinned);
  const rest = visible.filter((n) => !n.pinned);

  function newNote() {
    const next = draftSeq + 1;
    setDraftSeq(next);
    setShowArchive(false);
    setSel({ key: `draft-${next}`, id: null });
  }

  function open(n: Note) {
    setSel({ key: n.id, id: n.id });
  }

  function onCreated(key: string, id: string) {
    // Only follow the new id if the user is still on that draft.
    setSel((s) => (s && s.key === key ? { key, id } : s));
  }

  function onSaved(id: string, fields: SavedFields, updatedAt: string) {
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === id);
      if (exists) {
        return prev.map((n) => (n.id === id ? { ...n, ...fields, updated_at: updatedAt } : n));
      }
      return [
        {
          id,
          ...fields,
          pinned: false,
          archived_at: null,
          created_at: updatedAt,
          updated_at: updatedAt,
        },
        ...prev,
      ];
    });
  }

  function patch(id: string, p: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...p } : n)));
  }

  async function togglePin(n: Note) {
    const res = await setNotePinned(n.id, !n.pinned);
    if (res.error) return toastErr(res.error);
    patch(n.id, { pinned: !n.pinned });
  }

  async function archive(n: Note) {
    const res = await setNoteArchived(n.id, true);
    if (res.error) return toastErr(res.error);
    patch(n.id, { archived_at: new Date().toISOString(), pinned: false });
    setSel(null);
  }

  async function restore(n: Note) {
    const res = await setNoteArchived(n.id, false);
    if (res.error) return toastErr(res.error);
    patch(n.id, { archived_at: null });
    setSel(null);
    setShowArchive(false);
  }

  async function purge(n: Note) {
    if (!window.confirm(t("notes.confirmPurge"))) return;
    const res = await purgeNote(n.id);
    if (res.error) return toastErr(res.error);
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    setSel(null);
  }

  const row = (n: Note) => {
    const on = sel?.id === n.id;
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => open(n)}
          className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
            on ? "bg-brand-600/10 shadow-[inset_3px_0_0_#BED631]" : "hover:bg-surface-soft"
          }`}
        >
          <div className="flex items-center gap-2">
            {n.pinned && <PinIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {n.title.trim() || t("notes.untitled")}
            </span>
            <span className="shrink-0 text-[11px] text-ink-faint">{formatDate(n.updated_at)}</span>
          </div>
          {snippet(n.body) && (
            <p className="mt-0.5 line-clamp-2 break-words text-xs text-ink-muted">
              {snippet(n.body)}
            </p>
          )}
          {n.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {n.tags.map((tag) => (
                <span key={tag} className="chip tone-neutral !px-2 !py-0 text-[10px]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </button>
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title={t("notes.title")}
        subtitle={t("notes.subtitle")}
        action={
          <button type="button" onClick={newNote} className="btn-primary whitespace-nowrap">
            <PlusIcon className="h-4 w-4" />
            {t("notes.new")}
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* List */}
        <div className={`card flex flex-col p-3 ${sel ? "hidden md:flex" : ""}`}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("notes.search")}
            className="input"
          />

          <div className="seg mt-3 w-full">
            <button
              type="button"
              onClick={() => setShowArchive(false)}
              className={`seg-btn flex-1 ${!showArchive ? "seg-btn-on" : ""}`}
            >
              {t("notes.title")}
            </button>
            <button
              type="button"
              onClick={() => setShowArchive(true)}
              className={`seg-btn flex-1 ${showArchive ? "seg-btn-on" : ""}`}
            >
              {t("notes.archiveView")}
            </button>
          </div>

          {allTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className={`chip ${tagFilter === null ? "bg-ink text-surface" : "tone-neutral"}`}
              >
                {t("notes.allTags")}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tagFilter && norm(tagFilter) === norm(tag) ? null : tag)}
                  className={`chip ${
                    tagFilter && norm(tagFilter) === norm(tag) ? "bg-ink text-surface" : "tone-neutral"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 max-h-[calc(100vh-18rem)] min-h-[8rem] overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-ink-faint">
                {query || tagFilter
                  ? t("notes.emptySearch")
                  : showArchive
                  ? t("notes.emptyArchive")
                  : t("notes.empty")}
              </p>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      {t("notes.pinned")}
                    </h2>
                    <ul className="space-y-0.5">{pinned.map(row)}</ul>
                  </>
                )}
                {rest.length > 0 && (
                  <>
                    {pinned.length > 0 && (
                      <h2 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                        {t("notes.others")}
                      </h2>
                    )}
                    <ul className="space-y-0.5">{rest.map(row)}</ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className={`card min-h-[60vh] p-4 md:p-6 ${sel ? "" : "hidden md:block"}`}>
          {sel ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSel(null)}
                  className="btn-ghost !px-3 !py-1.5 md:hidden"
                >
                  ← {t("notes.back")}
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {selected && !selected.archived_at && (
                    <>
                      <button
                        type="button"
                        onClick={() => togglePin(selected)}
                        className="btn-ghost !px-3 !py-1.5"
                      >
                        <PinIcon className="h-4 w-4" />
                        {selected.pinned ? t("notes.unpin") : t("notes.pin")}
                      </button>
                      <button
                        type="button"
                        onClick={() => archive(selected)}
                        className="btn-ghost !px-3 !py-1.5"
                      >
                        {t("notes.archive")}
                      </button>
                    </>
                  )}
                  {selected?.archived_at && (
                    <>
                      <span className="text-xs text-ink-faint">{t("notes.archivedNote")}</span>
                      <button
                        type="button"
                        onClick={() => restore(selected)}
                        className="btn-ghost !px-3 !py-1.5"
                      >
                        {t("notes.restore")}
                      </button>
                      <button
                        type="button"
                        onClick={() => purge(selected)}
                        className="btn-danger !px-3 !py-1.5"
                      >
                        {t("notes.deleteForever")}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <NoteEditor
                key={sel.key}
                note={selected}
                users={users}
                tasks={tasks}
                allTags={allTags}
                readOnly={!!selected?.archived_at}
                onCreated={(id) => onCreated(sel.key, id)}
                onSaved={onSaved}
              />
            </div>
          ) : (
            <p className="py-24 text-center text-sm text-ink-faint">{t("notes.selectNote")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlusIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PinIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    </svg>
  );
}
