import type { TaskPriority, TaskStatus } from "@/lib/types";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-[28px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-surface-soft text-ink-muted",
  in_progress: "bg-blue-50 text-blue-700",
  done: "bg-green-50 text-green-700",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function StatusChip({ status }: { status: TaskStatus }) {
  return <span className={`chip ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
};

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`chip capitalize ${PRIORITY_STYLES[priority]}`}>
      <FlagIcon className="h-3 w-3" />
      {priority}
    </span>
  );
}

function FlagIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 21V4M5 4h10l-1.6 3.5L15 11H5" />
    </svg>
  );
}
