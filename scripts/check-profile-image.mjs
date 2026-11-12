// Checks the profile picture / name rules (lib/profile-image.ts) without a
// browser or a database. Run: node scripts/check-profile-image.mjs
import assert from "node:assert/strict";
import {
  checkFile,
  checkDimensions,
  targetSize,
  isOwnImagePath,
  splitName,
  joinName,
  extensionFor,
  MAX_INPUT_BYTES,
} from "../lib/profile-image.ts";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log("ok  ", name);
};

const MB = 1024 * 1024;
const UID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER = "223e4567-e89b-12d3-a456-426614174000";
const FILE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

ok("accepts jpeg, png, webp", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(checkFile({ type, size: MB }), null);
});
ok("rejects other formats", () => {
  for (const type of ["image/gif", "image/svg+xml", "image/heic", "application/pdf", "text/html", ""]) {
    assert.equal(checkFile({ type, size: MB }), "format", type);
  }
});
ok("size limit is 10 MB, empty files refused", () => {
  assert.equal(checkFile({ type: "image/png", size: MAX_INPUT_BYTES }), null);
  assert.equal(checkFile({ type: "image/png", size: MAX_INPUT_BYTES + 1 }), "bytes");
  assert.equal(checkFile({ type: "image/png", size: 0 }), "bytes");
});
ok("avatar needs 128 px on its short side", () => {
  assert.equal(checkDimensions("avatar", 128, 128), null);
  assert.equal(checkDimensions("avatar", 127, 4000), "small");
  assert.equal(checkDimensions("avatar", 4000, 127), "small");
  assert.equal(checkDimensions("avatar", 3000, 4000), null);
});
ok("cover needs 800 x 200", () => {
  assert.equal(checkDimensions("cover", 800, 200), null);
  assert.equal(checkDimensions("cover", 799, 500), "small");
  assert.equal(checkDimensions("cover", 1600, 199), "small");
});
ok("huge pixel counts refused", () => {
  assert.equal(checkDimensions("cover", 20000, 20000), "pixels");
  assert.equal(checkDimensions("avatar", 10000, 6000), "pixels");
  assert.equal(checkDimensions("cover", 7000, 7000), null);
});
ok("nonsense dimensions refused", () => {
  assert.equal(checkDimensions("avatar", 0, 500), "small");
  assert.equal(checkDimensions("avatar", NaN, 500), "small");
  assert.equal(checkDimensions("cover", -5, 500), "small");
});
ok("avatar is a square capped at 640", () => {
  assert.deepEqual(targetSize("avatar", 4000, 3000), { w: 640, h: 640 });
  assert.deepEqual(targetSize("avatar", 300, 500), { w: 300, h: 300 });
});
ok("cover keeps its shape, never scaled up, capped at 1920 x 1080", () => {
  assert.deepEqual(targetSize("cover", 1000, 300), { w: 1000, h: 300 });
  assert.deepEqual(targetSize("cover", 3840, 1000), { w: 1920, h: 500 });
  assert.deepEqual(targetSize("cover", 1200, 3000), { w: 432, h: 1080 });
});
ok("extensions", () => {
  assert.equal(extensionFor("image/webp"), "webp");
  assert.equal(extensionFor("image/jpeg"), "jpg");
  assert.equal(extensionFor("image/png"), "png");
  assert.equal(extensionFor("image/gif"), null);
});
ok("own image path accepted", () => {
  for (const ext of ["webp", "jpg", "png"]) {
    assert.equal(isOwnImagePath(UID, "avatar", `${UID}/avatar-${FILE}.${ext}`), true);
    assert.equal(isOwnImagePath(UID, "cover", `${UID}/cover-${FILE}.${ext}`), true);
  }
});
ok("other people's folders, wrong kind, traversal and odd files refused", () => {
  const bad = [
    `${OTHER}/avatar-${FILE}.webp`,
    `${UID}/cover-${FILE}.webp`, // recorded as avatar below
    `${UID}/../${OTHER}/avatar-${FILE}.webp`,
    `${UID}/avatar-${FILE}.gif`,
    `${UID}/avatar-${FILE}.webp.exe`,
    `${UID}/avatar-notauuid.webp`,
    `/${UID}/avatar-${FILE}.webp`,
    `${UID}/sub/avatar-${FILE}.webp`,
    `https://evil.example/${UID}/avatar-${FILE}.webp`,
    "",
  ];
  for (const p of bad) assert.equal(isOwnImagePath(UID, "avatar", p), false, p);
  assert.equal(isOwnImagePath("not-a-uuid", "avatar", `not-a-uuid/avatar-${FILE}.webp`), false);
  assert.equal(isOwnImagePath(`${UID}|.*`, "avatar", `${UID}|.*/avatar-${FILE}.webp`), false);
});
ok("splitName / joinName", () => {
  assert.deepEqual(splitName("Ali Kaan"), { first: "Ali", last: "Kaan" });
  assert.deepEqual(splitName("  Ahmet   Yılmaz  Öz "), { first: "Ahmet", last: "Yılmaz Öz" });
  assert.deepEqual(splitName("Merve"), { first: "Merve", last: "" });
  assert.deepEqual(splitName(""), { first: "", last: "" });
  assert.deepEqual(joinName(" Ali ", " Kaan "), { full_name: "Ali Kaan", first_name: "Ali" });
  assert.deepEqual(joinName("Merve", ""), { full_name: "Merve", first_name: "Merve" });
  assert.deepEqual(joinName("", "Kaan"), { full_name: "Kaan", first_name: "Kaan" });
  assert.deepEqual(joinName("Ömer", "Çelik  Öz"), { full_name: "Ömer Çelik Öz", first_name: "Ömer" });
});

console.log(`\n${n} checks passed`);
