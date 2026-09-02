"use client";

import { useCallback, useRef, useState } from "react";
import { toastErr } from "./toast";

// Server actions in this app all resolve to `{ ok: true }` or `{ error: "…" }`
// rather than throwing, so callers check `res.error`.
type ActionResult = { ok?: boolean; error?: string } | null | void;

/**
 * Wraps a server action with the pending/error handling that was previously
 * hand-rolled in every component that calls one.
 *
 * Beyond removing the boilerplate it fixes two bugs the hand-rolled version
 * had everywhere:
 *   - a thrown exception (offline, tunnel down) left `saving` stuck true, so
 *     the button stayed disabled on "Saving…" until a reload;
 *   - nothing stopped a second submit while the first was still in flight,
 *     so a double tap could create two records.
 *
 * By default failures are surfaced as a toast. Pass `inline: true` for forms
 * that render the message themselves — `error` is populated either way.
 */
export function useAction<A extends unknown[], R extends ActionResult>(
  action: (...args: A) => Promise<R>,
  opts: { onSuccess?: (res: R) => void; inline?: boolean } = {}
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not state: the guard has to be correct within a single tick, before
  // React has re-rendered with pending=true.
  const inFlight = useRef(false);

  // opts is usually an inline object literal, so read it through a ref to keep
  // `run` stable across renders (safe to use in deps / pass to children).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        const res = await action(...args);
        if (res?.error) {
          setError(res.error);
          if (!optsRef.current.inline) toastErr(res.error);
          return undefined;
        }
        optsRef.current.onSuccess?.(res);
        return res;
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Something went wrong. Try again.";
        setError(msg);
        if (!optsRef.current.inline) toastErr(msg);
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [action]
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}
