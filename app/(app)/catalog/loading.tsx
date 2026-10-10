import { Skeleton, SkeletonRows } from "@/components/skeleton";

// Shown instantly on navigation while the server component streams in.
// Without this, Next has nothing to paint and the whole screen sits on the
// previous page until the data query finishes — which read as "switching
// screens is slow".
export default function Loading() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="card p-4">
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}
