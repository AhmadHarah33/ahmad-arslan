export const SPARE_PHOTOS_BUCKET = "spare-part-photos";

// Public URL for a file in the public spare-part-photos bucket.
export function photoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${SPARE_PHOTOS_BUCKET}/${path}`;
}
