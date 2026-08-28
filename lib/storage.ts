export const SPARE_PHOTOS_BUCKET = "spare-part-photos";

// Public URL for a file in the public spare-part-photos bucket.
// Absolute URLs (used by preview/demo sample data) are passed through as-is.
export function photoUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${SPARE_PHOTOS_BUCKET}/${path}`;
}
