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

// Status colors live in globals.css as `.tone-*` so they stay readable in both
// light and dark mode; see the --tone-* tokens there.
export const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "tone-neutral",
  in_progress: "tone-progress",
  done: "tone-done",
  stuck: "tone-stuck",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  stuck: "Stuck",
};

export function StatusChip({ status }: { status: TaskStatus }) {
  return <span className={`chip ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "tone-done",
  medium: "tone-warn",
  high: "tone-stuck",
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
