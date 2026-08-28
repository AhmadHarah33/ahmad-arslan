import type { AssigneeLite } from "@/lib/types";

const COLORS = [
  "bg-red-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-600",
  "bg-slate-500",
];

function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % COLORS.length;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  id,
  size = 24,
}: {
  name: string;
  id: string;
  size?: number;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${COLORS[hashIndex(id)]}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

// Overlapping avatar stack for a task's assignees.
export function AvatarGroup({
  people,
  size = 22,
  max = 4,
}: {
  people: AssigneeLite[];
  size?: number;
  max?: number;
}) {
  if (people.length === 0)
    return <span className="text-xs text-ink-faint">Unassigned</span>;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <span key={p.id} className="ring-2 ring-surface rounded-full">
            <Avatar
              id={p.id}
              name={p.full_name || p.first_name}
              size={size}
            />
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="ml-1 text-xs text-ink-faint">+{extra}</span>
      )}
    </div>
  );
}
