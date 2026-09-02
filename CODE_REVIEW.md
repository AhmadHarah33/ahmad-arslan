# Code Quality & Maintainability Review

_Reviewed 2026-09-02 · 67 source files, ~8,470 LOC._

**Overall:** this codebase was in better shape than most. There were **no dead
files**, **no unused dependencies**, and **no orphaned modules**. The debt was
concentrated in one place — preview/demo mode, which touched 45% of the file
surface. Everything else was small.

**All three phases are now done**, bar two items left open on purpose (5 of the
11 `useAction` migrations, and the `board.tsx` split). Net: ~1,000 lines removed
across three commits. See the checklists at the bottom, and read the
"before cleaning up anything" section before acting on any of this.

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

`TAG_COLORS`, `bucketUrl` and `ROLE_LABELS` were made file-local in Phase 2.
`DueStatus`, `AccentPreset`, `LoadedFields` and `CustomerLink` stay exported —
see the Phase 2 note below.

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
`useAction()` (`lib/use-action.ts`) returns `{ run, pending, error, clearError }`
and fixes two bugs the hand-rolled version had **everywhere**:

- a thrown exception (offline, tunnel down) left `saving` stuck `true`, so the
  button sat disabled on "Saving…" until a page reload;
- nothing guarded against a second submit while the first was in flight, so a
  double tap could create two records.

`team-view`'s `MemberRow` had a third: it ignored the result entirely, so a
rejected role change looked like it had worked until the refresh reverted it.

6 of 11 migrated in Phase 2; see the plan below for which 5 were left and why.

## 3. Unused UI components

Only `EmptyState` and `CountBar` (both now removed). Every other component is
reachable — a genuinely good result for a codebase this size.

## 4. Overly complex implementations

| File | LOC | Note |
|---|---|---|
| `components/tasks/board.tsx` | 890 | Kanban + dnd-kit + mobile menus + filters in one file. The real hotspot. |
| `components/fields/CustomFields.tsx` | 636 | Field CRUD + rendering + type-specific editors combined. |
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

It existed solely for the Vercel demo (`vercel.json` set `NEXT_PUBLIC_PREVIEW=1`).
Production runs self-hosted at `marsmeddenterp.site`, so the demo no longer
earned it.

**Removed in Phase 3** — this was a product decision, taken by the project owner,
not a code decision. See the Phase 3 checklist for exactly what came out.

---

## Cleanup plan

### Phase 1 — DONE (2026-09-02)
- [x] `cache()` on `getProfile` — kills a duplicate `getUser()` + profiles SELECT per navigation
- [x] `PROJECT_STATE.md` corrected — was claiming preview mode / no database
- [x] `deleteCompany` deleted (dead, and cascade-destructive)
- [x] 7 dead exports removed; `blurPx` downgraded to file-local
- [x] `npm run db:backup` added
- [x] `tsc --noEmit` clean, production build clean

### Phase 2 — mostly done (2026-09-02)
- [x] `PageHeader` adopted in all 3 views that duplicated it
- [x] `useAction()` added (`lib/use-action.ts`) and 6 of 11 components migrated:
      `team-view`, `spare-parts-view`, `task-activity`, `maintenance`,
      `task-parts`, `customer-modal`
- [x] `TAG_COLORS`, `bucketUrl`, `ROLE_LABELS` made file-local
- [ ] **5 components not migrated — deliberately.** They do not fit the simple
      wrap and forcing them through it would add complexity, not remove it:
      - `part-modal.tsx`, `CustomFields.tsx` (upload branch) — the pending flag
        spans a Supabase Storage upload *and* the action, with several exit
        paths. Needs a different abstraction (or none).
      - `settings-modal.tsx` — chains two actions under one flag.
      - `task-modal.tsx` — branches between `createTask` and `updateTask`.
        Tractable, but it is the highest-traffic modal in the app; migrate it
        on its own, with a click-through.
      - `import-export.tsx` — loops over rows client-side; not a single action
        call at all.
- [ ] `DueStatus`, `AccentPreset`, `LoadedFields`, `CustomerLink` were flagged
      as de-exportable and are **not**: each appears in an exported signature or
      interface, so consumers need to be able to name them. Leave exported.

### Phase 3 — DONE (2026-09-02)
- [x] **Preview/demo mode removed.** Decision taken by the project owner.
      Deleted `lib/preview.ts` and `vercel.json`; stripped every `PREVIEW`
      branch from 29 files; removed the middleware auth bypass, the "Preview
      mode" banner, `previewSearch` in the command palette, and the orphaned
      sample data in `admin/page.tsx` and `task-activity.tsx`.
      `app/(app)/layout.tsx` gained a `FALLBACK_SETTINGS` constant, because it
      previously leaned on `previewAppSettings` as its default when the
      `app_settings` row is missing.
      Result: ~700 LOC gone, zero `PREVIEW` references left in the codebase,
      and smaller client bundles (`/customers` 7.28 → 6.45 kB, `/spare-parts`
      5.79 → 4.99 kB, `/tasks` 26.0 → 25.1 kB).
      The Vercel project `mars-technical-support` no longer has anything to
      build and can be deleted.
- [ ] `board.tsx` split — still open, still deliberate: do it when you are next
      in that file for a feature, not as a cleanup.

### Do NOT touch
Applied migrations · `metadata` exports · `fab.tsx` ·
`service-history`/`maintenance` · `board.tsx` animation logic
