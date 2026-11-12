export const SPARE_PHOTOS_BUCKET = "spare-part-photos";
export const FIELD_FILES_BUCKET = "field-files";
export const PROFILE_IMAGES_BUCKET = "profile-images";

// Public URL for a file in a public Storage bucket.
// Absolute URLs are passed through as-is.
function bucketUrl(bucket: string, path: string): string {
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

export function profileImageUrl(path: string | null | undefined): string | null {
  return path ? bucketUrl(PROFILE_IMAGES_BUCKET, path) : null;
}
