// Money entry and display.
//
// The price field was <input type="number">, which brings spinner arrows,
// swallows what it considers invalid mid-typing, and pairs badly with a
// toFixed(2) display that turned 3.6 into "3.60". These keep it a plain text
// field that only accepts digits and one decimal separator, and show back
// exactly the amount that was entered.

// Strip anything that is not a digit or a decimal point, and allow only one
// point. Commas are accepted as the separator and normalised, since a Turkish
// keyboard's numeric row puts a comma where the decimal goes.
export function sanitizeAmount(raw: string): string {
  const normalised = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = normalised.indexOf(".");
  if (firstDot === -1) return normalised;
  return (
    normalised.slice(0, firstDot + 1) +
    normalised.slice(firstDot + 1).replace(/\./g, "")
  );
}

export function parseAmount(raw: string): number | null {
  const clean = sanitizeAmount(raw);
  if (!clean || clean === ".") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

// Group the thousands, but never pad decimals: 3.6 stays "3.6", 1250 becomes
// "1,250". Formatted by hand rather than with toLocaleString, which resolves
// against the *runtime's* locale — Node on the server, the browser on the
// client — and so renders two different strings for the same number and
// trips a hydration mismatch.
export function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";

  let text = n.toFixed(2);
  if (text.endsWith(".00")) text = text.slice(0, -3);
  else if (text.endsWith("0")) text = text.slice(0, -1);

  const [whole, fraction] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
