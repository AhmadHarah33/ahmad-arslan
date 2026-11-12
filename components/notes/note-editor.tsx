"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { createNote, updateNote } from "@/app/(app)/notes/actions";
import { MAX_TAG_LEN, MAX_TAGS, cleanTags, markerFor, splitBody } from "@/lib/notes";
import type { Note, NoteMention } from "@/lib/notes";
import type { AssigneeLite } from "@/lib/types";

export type SavedFields = Pick<Note, "title" | "body" | "mentions" | "tags">;
type Status = "idle" | "saving" | "saved" | "error";

type Trigger = { marker: "@" | "#"; query: string; start: number };
type Option = { kind: NoteMention["kind"]; id: string; label: string };

const SAVE_DELAY_MS = 700;
const MAX_TASK_LABEL = 40;

// Looks back from the caret for an unfinished "@name" / "#task" being typed.
function findTrigger(value: string, caret: number): Trigger | null {
  const m = /(^|\s)([@#])([^\s@#]*)$/.exec(value.slice(0, caret));
  if (!m) return null;
  return { marker: m[2] as "@" | "#", query: m[3], start: caret - m[3].length - 1 };
}

const norm = (s: string) => s.toLocaleLowerCase();

export default function NoteEditor({
  note,
  users,
  tasks,
  allTags,
  readOnly,
  onCreated,
  onSaved,
}: {
  // null = a brand-new note that has not been written to the database yet.
  note: Note | null;
  users: AssigneeLite[];
  tasks: { id: string; title: string }[];
  allTags: string[];
  readOnly: boolean;
  onCreated: (id: string) => void;
  onSaved: (id: string, fields: SavedFields, updatedAt: string) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [mentions, setMentions] = useState<NoteMention[]>(note?.mentions ?? []);
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [status, setStatus] = useState<Status>("idle");

  // --- autosave -----------------------------------------------------------
  const idRef = useRef<string | null>(note?.id ?? null);
  const latest = useRef<SavedFields>({ title, body, mentions, tags });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const cbs = useRef({ onCreated, onSaved });
  cbs.current = { onCreated, onSaved };

  const saveNow = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // A save is already running: it loops once more when it finishes.
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        if (!dirty.current) break;
        const snap = latest.current;
        dirty.current = false;
        const empty = !snap.title.trim() && !snap.body.trim() && snap.tags.length === 0;
        // Never create an empty note.
        if (!idRef.current && empty) break;

        setStatus("saving");
        const res: { id?: string; updated_at?: string; error?: string } = idRef.current
          ? await updateNote(idRef.current, snap)
          : await createNote(snap);
        if (res.error || !res.updated_at) {
          dirty.current = true; // retried on the next change
          setStatus("error");
          break;
        }
        if (!idRef.current && res.id) {
          idRef.current = res.id;
          cbs.current.onCreated(res.id);
        }
        if (idRef.current) cbs.current.onSaved(idRef.current, snap, res.updated_at);
        setStatus(dirty.current ? "saving" : "saved");
      } while (again.current || dirty.current);
    } catch {
      dirty.current = true;
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const touch = useCallback(
    (next: Partial<SavedFields>) => {
      latest.current = { ...latest.current, ...next };
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
    },
    [saveNow]
  );

  // Write out anything still pending when the note is closed or the tab hides.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty.current) void saveNow();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (dirty.current) void saveNow();
    };
  }, [saveNow]);

  // --- body + @ / # autocomplete -----------------------------------------
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const caretTo = useRef<number | null>(null);
  // Zero-width marker in the highlight layer at the trigger; its position is
  // where the menu opens, so it sits by the text instead of under the box.
  const markerRef = useRef<HTMLSpanElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const options: Option[] = useMemo(() => {
    if (!trigger || readOnly) return [];
    const q = norm(trigger.query);
    if (trigger.marker === "@") {
      return users
        .map((u) => ({
          kind: "user" as const,
          id: u.id,
          label: (u.full_name || u.first_name || "").trim(),
        }))
        .filter((o) => o.label && norm(o.label).includes(q))
        .slice(0, 6);
    }
    return tasks
      .map((k) => ({
        kind: "task" as const,
        id: k.id,
        label: k.title.replace(/\s+/g, " ").trim().slice(0, MAX_TASK_LABEL).trim(),
      }))
      .filter((o) => o.label && norm(o.label).includes(q))
      .slice(0, 6);
  }, [trigger, users, tasks, readOnly]);

  const liveMentions = useMemo(
    () => mentions.filter((m) => body.includes(markerFor(m.kind) + m.label)),
    [mentions, body]
  );

  useEffect(() => {
    if (active >= options.length) setActive(0);
  }, [options.length, active]);

  // Auto-grow the textarea and restore the caret after a mention is inserted.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    if (caretTo.current !== null) {
      ta.focus();
      ta.setSelectionRange(caretTo.current, caretTo.current);
      caretTo.current = null;
    }
  }, [body]);

  useLayoutEffect(() => {
    const m = markerRef.current;
    if (!trigger || !m) return;
    const width = m.offsetParent instanceof HTMLElement ? m.offsetParent.clientWidth : 0;
    const left = Math.max(0, Math.min(m.offsetLeft, width - 300));
    setMenuPos((p) => (p.top === m.offsetTop + 28 && p.left === left ? p : { top: m.offsetTop + 28, left }));
  }, [trigger, body]);

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    touch({ body: value });
    setTrigger(findTrigger(value, e.target.selectionStart));
  }

  function refreshTrigger() {
    const ta = taRef.current;
    if (ta) setTrigger(findTrigger(ta.value, ta.selectionStart));
  }

  function pick(o: Option) {
    if (!trigger) return;
    const caret = taRef.current?.selectionStart ?? body.length;
    const inserted = markerFor(o.kind) + o.label + " ";
    const next = body.slice(0, trigger.start) + inserted + body.slice(caret);
    const nextMentions = mentions.some(
      (m) => m.kind === o.kind && m.id === o.id && m.label === o.label
    )
      ? mentions
      : [...mentions, { kind: o.kind, id: o.id, label: o.label }];
    caretTo.current = trigger.start + inserted.length;
    setBody(next);
    setMentions(nextMentions);
    setTrigger(null);
    touch({ body: next, mentions: nextMentions });
  }

  function onBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!trigger || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(options[active] ?? options[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTrigger(null);
    }
  }

  // Highlight layer drawn behind the transparent textarea.
  const backdrop = useMemo(() => {
    const render = (text: string, keyPrefix: string) =>
      splitBody(text, liveMentions).map((p, i) =>
        "mention" in p ? (
          <mark
            key={keyPrefix + i}
            className={`rounded-[5px] text-transparent ${
              p.mention.kind === "user" ? "bg-brand-600/20" : "bg-amber-500/25"
            }`}
          >
            {markerFor(p.mention.kind) + p.mention.label}
          </mark>
        ) : (
          <span key={keyPrefix + i}>{p.text}</span>
        )
      );
    if (!trigger) return render(body, "a");
    return (
      <>
        {render(body.slice(0, trigger.start), "a")}
        <span ref={markerRef} />
        {render(body.slice(trigger.start), "b")}
      </>
    );
  }, [body, liveMentions, trigger]);

  // --- tags ---------------------------------------------------------------
  const [tagInput, setTagInput] = useState("");
  const [tagFocus, setTagFocus] = useState(false);

  const tagSuggestions = useMemo(() => {
    const have = new Set(tags.map(norm));
    const q = norm(tagInput.trim());
    return allTags.filter((x) => !have.has(norm(x)) && (!q || norm(x).includes(q))).slice(0, 6);
  }, [allTags, tags, tagInput]);

  function addTag(raw: string) {
    const typed = raw.trim();
    if (!typed) return;
    // Reuse the spelling of an existing tag so "staff" does not fork "Staff".
    const existing = allTags.find((x) => norm(x) === norm(typed));
    const next = cleanTags([...tags, existing ?? typed]);
    setTagInput("");
    if (next.length === tags.length) return;
    setTags(next);
    touch({ tags: next });
  }

  function removeTag(tag: string) {
    const next = tags.filter((x) => x !== tag);
    setTags(next);
    touch({ tags: next });
  }

  const statusText =
    status === "saving"
      ? t("notes.saving")
      : status === "saved"
      ? t("notes.saved")
      : status === "error"
      ? t("notes.saveFailed")
      : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start gap-3">
        <input
          value={title}
          readOnly={readOnly}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            touch({ title: e.target.value });
          }}
          placeholder={t("notes.titlePlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-xl font-bold tracking-tight text-ink outline-none placeholder:text-ink-faint md:text-2xl"
        />
        <span
          aria-live="polite"
          className={`shrink-0 pt-2 text-xs ${status === "error" ? "text-red-600" : "text-ink-faint"}`}
        >
          {statusText}
        </span>
      </div>

      {/* Body: highlight layer + textarea share identical metrics. */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-[15px] leading-relaxed"
        >
          {backdrop}
          {"​"}
        </div>
        <textarea
          ref={taRef}
          value={body}
          readOnly={readOnly}
          onChange={onBodyChange}
          onKeyDown={onBodyKeyDown}
          onKeyUp={(e) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) refreshTrigger();
          }}
          onClick={refreshTrigger}
          onBlur={() => setTrigger(null)}
          placeholder={t("notes.bodyPlaceholder")}
          rows={8}
          className="relative block min-h-[40vh] w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />

        {trigger && options.length > 0 && (
          <ul
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="card glass-strong animate-pop absolute z-20 w-72 max-w-full overflow-hidden py-1"
          >
            {options.map((o, i) => (
              <li key={`${o.kind}:${o.id}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // mousedown, not click: the textarea would blur first and close the menu.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === active ? "bg-surface-soft text-ink" : "text-ink-muted"
                  }`}
                >
                  <span className="font-semibold text-ink-faint">{markerFor(o.kind)}</span>
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {trigger && options.length === 0 && trigger.query && !readOnly && (
          <div
            style={{ top: menuPos.top, left: menuPos.left }}
            className="card glass-strong absolute z-20 w-72 max-w-full px-3 py-2 text-sm text-ink-faint"
          >
            {t("notes.noMatches")}
          </div>
        )}
      </div>

      {liveMentions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {t("notes.mentions")}
          </span>
          {liveMentions.map((m) => (
            <span key={`${m.kind}:${m.id}`} className="chip tone-neutral">
              {markerFor(m.kind)}
              {m.label}
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      <div className="relative border-t border-surface-border pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {t("notes.tags")}
          </span>
          {tags.map((tag) => (
            <span key={tag} className="chip tone-neutral">
              {tag}
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => removeTag(tag)}
                  className="-mr-1 ml-1 rounded-full px-1 text-ink-faint hover:text-ink"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {!readOnly && tags.length < MAX_TAGS && (
            <input
              value={tagInput}
              maxLength={MAX_TAG_LEN}
              onChange={(e) => setTagInput(e.target.value.replace(/,/g, ""))}
              onFocus={() => setTagFocus(true)}
              onBlur={() => {
                setTagFocus(false);
                addTag(tagInput);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              placeholder={t("notes.tagPlaceholder")}
              className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          )}
        </div>
        {tagFocus && tagSuggestions.length > 0 && (
          <ul className="card glass-strong animate-pop absolute left-0 top-full z-20 mt-1 w-full max-w-xs overflow-hidden py-1">
            {tagSuggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface-soft hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
