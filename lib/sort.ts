// Name ordering that is identical on the server and in the browser.
//
// A bare `a.localeCompare(b)` uses the machine's default language, and the Node
// server and the visitor's browser don't share one — so "ŞENKAL" sorted before
// "Sonic" on the server but after it in the browser. React then saw different
// lists, threw away the server-rendered page and redrew everything on every
// load. Pinning the language also gives proper Turkish order (S < Ş, I < İ).
const collator = new Intl.Collator("tr");

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

// Part numbers like DOF_2 / DOF_10 / DOF_011: `numeric` compares the digit runs
// as numbers, so DOF_2 comes before DOF_10 instead of after it. Parts with no
// number go to the end of their list.
const partCollator = new Intl.Collator("tr", { numeric: true });

export function comparePartNumbers(a: string | null, b: string | null): number {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x || !y) return x === y ? 0 : x ? -1 : 1;
  return partCollator.compare(x, y);
}
