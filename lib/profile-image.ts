// Rules for the profile picture and cover image, kept free of browser and
// server code so the same checks run in the page, in the server action and in
// scripts/check-profile-image.mjs.

export type ImageKind = "avatar" | "cover";

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_INPUT_BYTES = 10 * 1024 * 1024; // what a person may pick
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024; // what the bucket accepts
export const MAX_PIXELS = 50_000_000; // refuses decompression bombs (e.g. 20000×20000)

export const MIN_SIZE: Record<ImageKind, { w: number; h: number }> = {
  avatar: { w: 128, h: 128 },
  cover: { w: 800, h: 200 },
};

// Longest side kept when the picture is re-encoded.
export const OUT_SIZE: Record<ImageKind, { w: number; h: number }> = {
  avatar: { w: 640, h: 640 },
  cover: { w: 1920, h: 1080 },
};

export type FileProblem = "format" | "bytes";
export type SizeProblem = "pixels" | "small";

export function checkFile(file: { type: string; size: number }): FileProblem | null {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) return "format";
  if (file.size > MAX_INPUT_BYTES || file.size === 0) return "bytes";
  return null;
}

export function checkDimensions(kind: ImageKind, w: number, h: number): SizeProblem | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return "small";
  if (w * h > MAX_PIXELS) return "pixels";
  const min = MIN_SIZE[kind];
  if (kind === "avatar" ? Math.min(w, h) < min.w : w < min.w || h < min.h) return "small";
  return null;
}

// Pixel size the picture is re-encoded at. The avatar is a centred square crop;
// the cover keeps its shape and is only ever scaled down.
export function targetSize(kind: ImageKind, w: number, h: number): { w: number; h: number } {
  const max = OUT_SIZE[kind];
  if (kind === "avatar") {
    const side = Math.min(Math.min(w, h), max.w);
    return { w: side, h: side };
  }
  const scale = Math.min(1, max.w / w, max.h / h);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export function extensionFor(type: string): "webp" | "jpg" | "png" | null {
  return type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : null;
}

// The storage path a person is allowed to record on their own profile:
// "<their id>/<kind>-<uuid>.<ext>". Anything else (someone else's folder, a
// path with "..", a different file type) is refused by the server action.
export function isOwnImagePath(userId: string, kind: ImageKind, path: string): boolean {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const re = new RegExp(`^${userId}/${kind}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(webp|jpg|png)$`, "i");
  return re.test(path);
}

// "Ahmet Yılmaz Öz" → first "Ahmet", last "Yılmaz Öz" (the first word is the
// first name everywhere else in the app).
export function splitName(full: string): { first: string; last: string } {
  const [first = "", ...rest] = full.trim().replace(/\s+/g, " ").split(" ");
  return { first, last: rest.join(" ") };
}

export function joinName(first: string, last: string): { full_name: string; first_name: string } {
  const f = first.trim().replace(/\s+/g, " ");
  const l = last.trim().replace(/\s+/g, " ");
  const full_name = [f, l].filter(Boolean).join(" ");
  return { full_name, first_name: full_name.split(" ")[0] ?? "" };
}
