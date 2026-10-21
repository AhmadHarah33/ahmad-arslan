import { addDays, addMonths, effectiveWarrantyEnd } from "./agreements";
import type { Agreement } from "./types";

// Warranty is automatic: installation date + the model's warranty months (set
// in the Catalog). Past that the customer is out of warranty, and only an
// agreement extension (Service section) brings them back. Pure helpers; the
// loader that feeds them is lib/warranty.server.ts.

// Last day under factory warranty: the installation anniversary minus a day,
// the same convention as a new agreement's default end date.
export function warrantyEndFromInstall(installedAt: string, months: number): string {
  return addDays(addMonths(installedAt, months), -1);
}

// A machine's factory warranty end. Computed from the install date and the
// model's months when both are known (`auto`); otherwise the date typed on the
// machine, if any, so machines the catalog can't price keep working as before.
export function factoryWarranty(
  installedAt: string | null,
  months: number | null,
  manualEnd: string | null
): { end: string | null; auto: boolean } {
  if (installedAt && months !== null && months !== undefined) {
    return { end: warrantyEndFromInstall(installedAt, months), auto: true };
  }
  return { end: manualEnd, auto: false };
}

export type CustomerWarranty = {
  // in / out are computed; manual = nothing to compute from, so the
  // customer's own In/Out switch still applies.
  state: "in" | "out" | "manual";
  // Latest warranty end across the customer's machines (factory or extension).
  end: string | null;
  installedAt: string | null;
  // True when the end is a computed one (install date + catalog months).
  auto: boolean;
  // True when a Service extension runs past the factory warranty.
  extended: boolean;
};

type Ext = Pick<Agreement, "includes_warranty" | "warranty_end" | "status">;

export function customerWarranty(
  today: string,
  installedAt: string | null,
  machines: {
    months: number | null;
    manualEnd: string | null;
    extensions: Ext[];
  }[]
): CustomerWarranty {
  let end: string | null = null;
  let factoryBest: string | null = null;
  let auto = false;
  for (const m of machines) {
    const f = factoryWarranty(installedAt, m.months, m.manualEnd);
    // An extension outlives its agreement's visits: an 'ended' agreement still
    // carries a warranty that runs to its own date. Drafts and cancelled don't.
    const exts = m.extensions.map((e) =>
      e.status === "ended" ? { ...e, status: "active" as const } : e
    );
    const eff = effectiveWarrantyEnd({ warranty_end: f.end }, exts);
    if (f.end && (!factoryBest || f.end > factoryBest)) factoryBest = f.end;
    if (eff && (!end || eff > end)) {
      end = eff;
      auto = f.auto;
    }
  }
  if (!end) return { state: "manual", end: null, installedAt, auto: false, extended: false };
  return {
    state: end >= today ? "in" : "out",
    end,
    installedAt,
    auto,
    extended: !!factoryBest && end > factoryBest,
  };
}
