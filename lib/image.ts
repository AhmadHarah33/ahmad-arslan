// Re-encode a photo as WebP before it is uploaded. The pixel size is left
// alone — photos get zoomed in on to check a part, so only the encoding
// changes. Quality 0.92 is visually lossless at 1:1 and typically a third of
// the size of a phone JPEG.
//
// Anything that can't be converted safely is uploaded as picked: formats the
// browser can't decode (HEIC outside Safari), browsers that can't encode WebP,
// images too large for the canvas, and files that are already WebP or would
// come out bigger.
const QUALITY = 0.92;

export async function toWebp(file: File): Promise<File> {
  if (file.type === "image/webp" || !file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    // from-image applies the EXIF rotation, which the canvas would otherwise drop.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY)
    );
    // Browsers that can't encode WebP silently hand back a PNG.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^./\\]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}
