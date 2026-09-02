# Code Quality & Maintainability Review

_Reviewed 2026-09-02 · 67 source files, ~8,470 LOC._

**Overall:** this codebase is in better shape than most. There are **no dead
files**, **no unused dependencies**, and **no orphaned modules**. The real debt
is concentrated in one place — preview/demo mode, which touches 45% of the file
surface. Everything else is small.

Phase 1 is **done** (see the checklist at the bottom). Phases 2 and 3 are open.

---

## ⚠️ Read this before "cleaning up" anything

Four things look like dead code and are not. An automated pass flagged all four;
all four are live.

| Looks dead | Actually |
|---|---|
| `metadata` in `app/layout.tsx` | Next.js framework convention — consumed by the framework, never imported. |
| `components/fab.tsx` | Still used by customers + spare-parts (only removed from the task board). |
| `service-history.tsx`, `maintenance.tsx` | Imported *relatively* by `customer-modal.tsx`. |
| `scripts/backup.sh` | Not an npm script until now, but documented in README + this file. |

Any cleanup script must resolve imports properly, not grep.

**Most dangerous false lead:** `supabase/migrations/20260828000000_init.sql`
references `tasks.assignee_id`, a column that no longer exists —
`20260828020000_theme_and_assignees` replaced it with the `task_assignees` join
table and rewrote the policies. The live policies are correct
(`is_task_member(id)`, `can_manage_tasks()`). **Do not edit applied migrations.**
They are an immutable historical log; editing them desynchronises every
environment and breaks `db reset`.

---

## 1. Dead code

**`deleteCompany`** (`app/(app)/spare-parts/actions.ts`) — the only dead server
action; all 30 others are wired to UI. `spare_parts.company_id` is
`ON DELETE CASCADE`, so it silently destroyed every part under a vendor. Either a
missing feature or a loaded gun. **Removed in Phase 1.** If vendor deletion is
actually wanted, reintroduce it deliberately with a confirmation + part-count
warning.

**Unused exports** — `CountBar` (charts.tsx), `EmptyState` (ui.tsx),
`formatDateLong` (dates.ts), `DEFAULT_ACCENT`/`DEFAULT_MODE` (theme.ts),
`DEFAULT_BG_STYLE`/`DEFAULT_BG_BLUR` (background.ts). All removed in Phase 1
(~100 LOC). Risk was near zero — TypeScript catches every mistake at build.

Still open: ~7 symbols exported but used only inside their own file
(`TAG_COLORS`, `bucketUrl`, `DueStatus`, `AccentPreset`, `LoadedFields`,
`ROLE_LABELS`, `CustomerLink`). Dropping `export` shrinks the public surface.

## 2. Duplicate logic

**`PageHeader` exists but three views hand-roll it.** `team-view.tsx`,
`customers-view.tsx` and `spare-parts-view.tsx` each reproduce the exact markup
(`text-2xl font-bold tracking-tight text-ink md:text-[28px]` + subtitle + action
slot) that `PageHeader` already implements. Adopting it removes ~30 LOC and makes
header styling changeable in one place. Watch the action-slot alignment —
`items-center` vs `items-start` differs slightly between them. **Phase 2.**

**The submit/error pattern is written 11 times.** Eleven components each
hand-roll `const [saving, setSaving] = useState(false)` → call action →
`if (res?.error) toastErr(...)`. 30 error-handling sites, 26 `toastErr` calls.
One `useAction()` hook returning `{ run, pending, error }` removes 100+ LOC and
makes error handling consistent. Migrate 2 components first, confirm behaviour,
then the rest. **Phase 2.**

## 3. Unused UI components

Only `EmptyState` and `CountBar` (both now removed). Every other component is
reachable — a genuinely good result for a codebase this size.

## 4. Overly complex implementations

| File | LOC | Note |
|---|---|---|
| `components/tasks/board.tsx` | 890 | Kanban + dnd-kit + mobile menus + filters in one file. The real hotspot. |
| `components/fields/CustomFields.tsx` | 636 | Field CRUD + rendering + type-specific editors combined. |
| `lib/preview.ts` | 444 | Mock data — see §8. |
| `app/(app)/page.tsx` | 379 | Dashboard: 4 queries + aggregation + presentation. |

`board.tsx` splits naturally along seams that already exist (`<Column>`,
`<TaskCard>`, drag handlers, mobile move-menu) — **but do it only when you next
touch it for a feature.** It was recently rewritten, it works, and it carries the
FLIP animation logic. Refactoring stable working code purely for line count is
how regressions get introduced.

## 5. Legacy code

Almost none. See the migrations warning above.

## 6. Redundant database queries — highest-value finding

`getProfile()` was not memoized, and both the layout and every page call
`requireProfile()`. Per single navigation:

| Layer | Cost |
|---|---|
| `middleware.ts` | `auth.getUser()` → network call to GoTrue |
| `app/(app)/layout.tsx` | `auth.getUser()` + `SELECT * FROM profiles` |
| `page.tsx` | `auth.getUser()` + `SELECT * FROM profiles` *(identical)* |

= 3× `auth.getUser()` + 2× identical `profiles` SELECT before any page data
loads. `auth.getUser()` is a real HTTP round trip (Kong → GoTrue), not a local
JWT decode. On top of that, `/` and `/admin` each hit `profiles` 4× total.

**Fixed in Phase 1** by wrapping `getProfile` in React's `cache()` — removes one
`getUser()` and one query per navigation. This is a direct contributor to the
slow screen-switching. `cache()` is request-scoped, so no staleness.

## 7. Abandoned / disconnected files

None abandoned. `scripts/backup.sh` was undiscoverable — now exposed as
`npm run db:backup`. `PROJECT_STATE.md` was **stale and actively misleading**
(claimed preview mode / no real database, named the wrong branch) — corrected in
Phase 1. Documentation debt bites hardest because it is what anyone reads first.

## 8. Technical debt: preview/demo mode

The largest structural item in the codebase.

| Metric | Value |
|---|---|
| Files touching `PREVIEW` | **30 of 67 (45%)** |
| Conditional branches | **51** |
| Mock data | **444 LOC** (`lib/preview.ts`) |

Every server action opens with `if (PREVIEW) return { ok: true }`; every page
branches between mock and real data. **Every future feature must be written
twice.**

It exists solely for the Vercel demo (`vercel.json` sets
`NEXT_PUBLIC_PREVIEW=1`). Production now runs self-hosted at
`marsmeddenterp.site`. Removing it frees 600+ LOC and 51 branches.

⚠️ **This is a product decision, not a code decision** — the one item where
"aggressive" could destroy something of value. If the UI is still demoed to
prospective customers without exposing real data, it is doing a real job: keep
it. If dropping it: delete `lib/preview.ts`, strip branches file-by-file
(TypeScript finds every one), remove `vercel.json`, delete the Vercel project.

---

## Cleanup plan

### Phase 1 — DONE (2026-09-02)
- [x] `cache()` on `getProfile` — kills a duplicate `getUser()` + profiles SELECT per navigation
- [x] `PROJECT_STATE.md` corrected — was claiming preview mode / no database
- [x] `deleteCompany` deleted (dead, and cascade-destructive)
- [x] 7 dead exports removed; `blurPx` downgraded to file-local
- [x] `npm run db:backup` added
- [x] `tsc --noEmit` clean, production build clean

### Phase 2 — open (~half a day, low risk)
- [ ] Adopt `PageHeader` in the 3 views that duplicate it
- [ ] Introduce `useAction()`; migrate 2–3 components as a trial, then the rest
- [ ] Drop `export` from the ~7 file-local symbols

### Phase 3 — decide, don't default
- [ ] **Preview mode: keep or remove** — needs a product call
- [ ] `board.tsx` split — only when next in there for a feature

### Do NOT touch
Applied migrations · `metadata` exports · `fab.tsx` ·
`service-history`/`maintenance` · `board.tsx` animation logic
