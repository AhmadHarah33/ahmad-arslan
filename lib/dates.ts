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

// Tones from globals.css so a due badge stays readable in light and dark.
export const DUE_STYLES: Record<Exclude<DueStatus, "none">, string> = {
  overdue: "tone-stuck",
  soon: "tone-warn",
};

// Dates are shown as dd.mm.yyyy, built straight from the stored YYYY-MM-DD.
// Not toLocaleDateString(): it uses the machine's locale, and the server and the
// browser disagree ("08/01/2027" vs "08.01.2027"), which made React report a
// hydration mismatch on every page that shows a date.
export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Compact form for dense cards — e.g. "3 Sep". Fixed for the same reason.
export function formatDateShort(d: string | null | undefined): string {
  if (!d) return "";
  const [, m, day] = d.slice(0, 10).split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(day)} ${month}` : d;
}
