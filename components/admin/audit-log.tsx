type AuditRow = {
  id: number | string;
  entity: string;
  action: string;
  summary: string;
  created_at: string;
};

const ACTION_STYLE: Record<string, string> = {
  insert: "bg-green-50 text-green-700",
  update: "bg-blue-50 text-blue-700",
  delete: "bg-red-50 text-red-700",
};

export default function AuditLog({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0)
    return (
      <p className="card px-5 py-8 text-center text-sm text-ink-faint">
        No activity recorded yet.
      </p>
    );
  return (
    <div className="card divide-y divide-surface-border overflow-hidden">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className={`chip ${ACTION_STYLE[r.action] ?? "bg-surface-soft text-ink-muted"}`}>
            {r.action}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            <span className="text-ink-faint">{r.entity.replace(/_/g, " ")}</span>
            {r.summary ? ` · ${r.summary}` : ""}
          </span>
          <span className="shrink-0 text-xs text-ink-faint">
            {new Date(r.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
