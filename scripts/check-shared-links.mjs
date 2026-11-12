// Checks the Shared drives input rules (lib/shared-links.ts).
// Run: node scripts/check-shared-links.mjs
import assert from "node:assert/strict";
import { cleanLink, DEFAULT_LINKS, LINK_ICONS } from "../lib/shared-links.ts";

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok  ", name); };
const good = (o) => cleanLink({ note: "", icon: "link", ...o });

ok("accepts https and adds a missing scheme", () => {
  assert.equal(good({ title: "Docs", url: "https://example.com/a?b=1" }).value.url, "https://example.com/a?b=1");
  assert.equal(good({ title: "Docs", url: "example.com/x" }).value.url, "https://example.com/x");
  assert.equal(good({ title: "Docs", url: "http://intranet/files" }).value.url, "http://intranet/files");
});
ok("refuses dangerous or odd schemes", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///c:/x", "ftp://x.com", "vbscript:x", "JaVaScRiPt:alert(1)"]) {
    assert.ok("error" in good({ title: "x", url }), url);
  }
});
ok("refuses empty, spaced and over-long input", () => {
  assert.ok("error" in good({ title: "", url: "https://a.com" }));
  assert.ok("error" in good({ title: "   ", url: "https://a.com" }));
  assert.ok("error" in good({ title: "x", url: "" }));
  assert.ok("error" in good({ title: "x", url: "https://a.com/with space" }));
  assert.ok("error" in good({ title: "x".repeat(61), url: "https://a.com" }));
  assert.ok("error" in good({ title: "x", url: "https://a.com", note: "n".repeat(81) }));
  assert.ok("error" in good({ title: "x", url: "https://a.com/" + "p".repeat(600) }));
});
ok("tidies names and falls back to the link icon", () => {
  const r = good({ title: "  Shared   files ", url: "https://a.com", icon: "nonsense" }).value;
  assert.equal(r.title, "Shared files");
  assert.equal(r.icon, "link");
  for (const icon of LINK_ICONS) assert.equal(good({ title: "x", url: "https://a.com", icon }).value.icon, icon);
});
ok("default links are valid", () => {
  for (const l of DEFAULT_LINKS) assert.ok("value" in good({ title: l.title, url: l.url, note: l.note, icon: l.icon }), l.title);
});
console.log(`\n${n} checks passed`);
