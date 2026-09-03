"use client";

import { useT } from "@/lib/i18n/provider";
import type { ApprovalAction } from "@/lib/types";

// One row's review status: a customer or spare part with no pending action is
// rendered as its normal Active/In-stock/etc. chip elsewhere — this is only
// for the three pending states, color-coded by what happens on approval.
export default function PendingBadge({ action }: { action: ApprovalAction | null }) {
  const t = useT();
  const key =
    action === "delete"
      ? "approval.pendingDelete"
      : action === "insert"
      ? "approval.pendingInsert"
      : "approval.pendingUpdate";
  const tone = action === "delete" ? "tone-stuck" : "tone-purple";
  return <span className={`chip ${tone}`}>{t(key)}</span>;
}
