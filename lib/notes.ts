// Shared by the notes screen and its server actions.

export interface NoteMention {
  kind: "user" | "task";
  id: string;
  // The text as typed after the @ / # marker, e.g. "Ali Kaan".
  label: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  mentions: NoteMention[];
  tags: string[];
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export const MAX_TAGS = 10;
export const MAX_TAG_LEN = 30;

// Trim, drop empties, collapse case-insensitive duplicates (first spelling
// wins), and cap the count/length.
export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = String(raw).trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LEN);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function markerFor(kind: NoteMention["kind"]): string {
  return kind === "user" ? "@" : "#";
}

export type BodyPart =
  | { text: string }
  | { mention: NoteMention };

// Splits a body into plain text and mention chips. Longest labels first so
// "@Ali Kaan" wins over a shorter "@Ali".
export function splitBody(body: string, mentions: NoteMention[]): BodyPart[] {
  const sorted = [...mentions].sort((a, b) => b.label.length - a.label.length);
  const parts: BodyPart[] = [];
  let rest = body;
  while (rest.length > 0) {
    let bestAt = -1;
    let best: NoteMention | null = null;
    for (const m of sorted) {
      const at = rest.indexOf(markerFor(m.kind) + m.label);
      if (at === -1) continue;
      if (bestAt === -1 || at < bestAt) {
        bestAt = at;
        best = m;
      }
    }
    if (!best) {
      parts.push({ text: rest });
      break;
    }
    if (bestAt > 0) parts.push({ text: rest.slice(0, bestAt) });
    parts.push({ mention: best });
    rest = rest.slice(bestAt + 1 + best.label.length);
  }
  return parts;
}
