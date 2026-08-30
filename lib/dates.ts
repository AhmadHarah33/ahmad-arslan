export type DueStatus = "overdue" | "soon" | "none";

// Classify a due date relative to today: overdue (past), soon (≤2 days), or none.
export function dueStatus(due: string | null | undefined): DueStatus {
  if (!due) return "none";
  const d = new Date(`${due}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "soon";
  return "none";
}

export const DUE_STYLES: Record<Exclude<DueStatus, "none">, string> = {
  overdue: "bg-red-50 text-red-700",
  soon: "bg-amber-50 text-amber-700",
};

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString();
}

// Long, readable form for cards — e.g. "March 30, 2025".
export function formatDateLong(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
