export const SPARE_PHOTOS_BUCKET = "spare-part-photos";
export const FIELD_FILES_BUCKET = "field-files";

// Public URL for a file in a public Storage bucket.
// Absolute URLs (used by preview/demo sample data) are passed through as-is.
export function bucketUrl(bucket: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function photoUrl(path: string): string {
  return bucketUrl(SPARE_PHOTOS_BUCKET, path);
}

export function fieldFileUrl(path: string): string {
  return bucketUrl(FIELD_FILES_BUCKET, path);
}
