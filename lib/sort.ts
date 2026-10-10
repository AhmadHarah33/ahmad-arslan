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
