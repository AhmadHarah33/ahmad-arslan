// The "Shared drives" card: its icons, defaults and input checks. Free of
// browser and server code so the page, the server action and the checks script
// all use the same rules.

export const LINK_ICONS = ["folder", "drive", "database", "desktop", "file", "link"] as const;
export type LinkIcon = (typeof LINK_ICONS)[number];

export interface SharedLink {
  id: string;
  title: string;
  note: string;
  url: string;
  icon: string;
  position?: number;
}

// Shown when the table does not exist yet (before the migration is applied), so
// the card never goes empty.
export const DEFAULT_LINKS: SharedLink[] = [
  {
    id: "default-database",
    title: "Database",
    note: "Opens Google Drive",
    url: "https://drive.google.com/drive/folders/1sGwxZYtF_dxSXz2HRgu3Erlx61LNqJKr?usp=drive_link",
    icon: "database",
  },
  {
    id: "default-desktop",
    title: "Desktop Data",
    note: "Opens Google Drive",
    url: "https://drive.google.com/drive/folders/1m_BFgqE0Y-DFh_MydXtBE-vi1xh0904C?usp=drive_link",
    icon: "desktop",
  },
];

// Trims and checks a new link. Only http(s) addresses are allowed, so a link can
// never be a javascript: or data: URL.
export function cleanLink(input: { title: string; url: string; note: string; icon: string }):
  | { value: { title: string; url: string; note: string; icon: LinkIcon } }
  | { error: string } {
  const title = (input.title ?? "").trim().replace(/\s+/g, " ");
  const note = (input.note ?? "").trim().replace(/\s+/g, " ");
  let url = (input.url ?? "").trim();
  if (!title) return { error: "Enter a name for the link" };
  if (title.length > 60) return { error: "The name is limited to 60 characters" };
  if (note.length > 80) return { error: "The note is limited to 80 characters" };
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Enter a valid web address" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Only http and https addresses are allowed" };
  }
  if (/\s/.test(url) || url.length > 600) return { error: "Enter a valid web address" };
  const icon = (LINK_ICONS as readonly string[]).includes(input.icon) ? (input.icon as LinkIcon) : "link";
  return { value: { title, url: parsed.toString(), note, icon } };
}
