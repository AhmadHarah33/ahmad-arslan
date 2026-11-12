"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROFILE_IMAGES_BUCKET, profileImageUrl } from "@/lib/storage";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { LANGUAGES } from "@/lib/i18n/dictionary";
import { roleKey } from "@/lib/i18n/roles";
import { ACCENTS, MODES, applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { applyBackground } from "@/lib/background";
import type { BackgroundStyle, Profile } from "@/lib/types";
import {
  changeOwnEmail,
  changeOwnPassword,
  saveBackground,
  saveProfileImage,
  saveProfileName,
  saveTheme,
} from "@/app/(app)/settings/actions";
import { Avatar } from "@/components/avatar";
import { Reveal } from "@/components/dashboard/motion";
import { CARD } from "@/components/dashboard/head-home";
import { toast, toastErr } from "@/lib/toast";
import type { StringKey } from "@/lib/i18n/dictionary";
import {
  MAX_OUTPUT_BYTES,
  checkDimensions,
  checkFile,
  extensionFor,
  splitName,
  targetSize,
  type ImageKind,
} from "@/lib/profile-image";

// The settings page: a cover picture and avatar the person can change, their
// name and surname, e-mail and password, and the look of the app.

const COVER_FALLBACK = "linear-gradient(120deg, #F4B06A 0%, #B8651F 55%, #6E3410 100%)";

type Prepared = { blob: Blob; ext: "webp" | "jpg" | "png" } | { error: string };

// Checks the picked file against the rules in lib/profile-image.ts, then
// re-encodes it as WebP: the avatar as a centred square, the cover scaled down
// (never up). Falls back to the original only when the browser cannot encode
// WebP and the original is small enough for the bucket.
async function prepare(file: File, kind: ImageKind, t: (k: StringKey) => string): Promise<Prepared> {
  const bad = checkFile(file);
  if (bad === "format") return { error: t("profile.notImage") };
  if (bad === "bytes") return { error: t("profile.imageTooBig") };

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { error: t("profile.notImage") };
  }
  try {
    const size = checkDimensions(kind, bmp.width, bmp.height);
    if (size === "pixels") return { error: t("profile.imageTooBig") };
    if (size === "small") return { error: t(kind === "avatar" ? "profile.avatarTooSmall" : "profile.coverTooSmall") };

    const out = targetSize(kind, bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: t("profile.uploadFailed") };
    if (kind === "avatar") {
      const side = Math.min(bmp.width, bmp.height);
      ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out.w, out.h);
    } else {
      ctx.drawImage(bmp, 0, 0, out.w, out.h);
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.9));
    if (blob && blob.type === "image/webp" && blob.size <= MAX_OUTPUT_BYTES) return { blob, ext: "webp" };
    const ext = extensionFor(file.type);
    if (ext && file.size <= MAX_OUTPUT_BYTES) return { blob: file, ext };
    return { error: t("profile.imageTooBig") };
  } finally {
    bmp.close();
  }
}

export default function ProfileSettings({
  profile,
  email,
  isOwner,
  bgStyle,
  bgBlur,
}: {
  profile: Profile;
  email: string;
  isOwner: boolean;
  bgStyle: BackgroundStyle;
  bgBlur: number;
}) {
  const t = useT();
  const router = useRouter();
  const initial = splitName(profile.full_name || profile.first_name || "");
  const [first, setFirst] = useState(initial.first);
  const [last, setLast] = useState(initial.last);
  const [savingName, setSavingName] = useState(false);
  const [avatar, setAvatar] = useState(profileImageUrl(profile.avatar_path));
  const [cover, setCover] = useState(profileImageUrl(profile.cover_path));
  const [busyImg, setBusyImg] = useState<"avatar" | "cover" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const displayName = [first, last].filter(Boolean).join(" ") || profile.full_name;
  const dirty = first.trim() !== initial.first || last.trim() !== initial.last;

  async function pick(kind: ImageKind, file: File | undefined) {
    if (!file || busyImg) return;
    setBusyImg(kind);
    try {
      const prepared = await prepare(file, kind, t);
      if ("error" in prepared) return toastErr(prepared.error);
      const path = `${profile.id}/${kind}-${crypto.randomUUID()}.${prepared.ext}`;
      const supabase = createClient();
      const up = await supabase.storage
        .from(PROFILE_IMAGES_BUCKET)
        .upload(path, prepared.blob, { contentType: prepared.blob.type, upsert: false });
      if (up.error) return toastErr(t("profile.uploadFailed"));
      const res = await saveProfileImage(kind, path);
      if (res?.error) {
        // The file is orphaned if the record failed; remove it again.
        await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([path]);
        return toastErr(res.error);
      }
      (kind === "avatar" ? setAvatar : setCover)(profileImageUrl(path));
      router.refresh();
    } catch {
      toastErr(t("profile.uploadFailed"));
    } finally {
      setBusyImg(null);
    }
  }

  async function clearImage(kind: "avatar" | "cover") {
    setBusyImg(kind);
    const res = await saveProfileImage(kind, null);
    setBusyImg(null);
    if (res?.error) return toastErr(res.error);
    (kind === "avatar" ? setAvatar : setCover)(null);
    router.refresh();
  }

  async function saveName() {
    setSavingName(true);
    const res = await saveProfileName({ first, last });
    setSavingName(false);
    if (res?.error) return toastErr(res.error);
    toast(t("profile.saved"), "success");
    router.refresh();
  }

  return (
    <div className="w-full space-y-5">
      {/* Cover */}
      <Reveal>
        <div className="relative h-44 overflow-hidden rounded-[28px] sm:h-56" style={{ background: COVER_FALLBACK }}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={() => coverInput.current?.click()}
              disabled={busyImg === "cover"}
              className="flex min-h-[40px] items-center rounded-full bg-surface/85 px-4 text-[13px] font-semibold text-ink backdrop-blur transition hover:bg-surface active:scale-95 disabled:opacity-60"
            >
              {busyImg === "cover" ? "…" : t("profile.changeCover")}
            </button>
            {cover && (
              <button
                type="button"
                onClick={() => clearImage("cover")}
                disabled={busyImg === "cover"}
                className="flex min-h-[40px] items-center rounded-full bg-surface/85 px-4 text-[13px] font-semibold text-ink backdrop-blur transition hover:bg-surface active:scale-95 disabled:opacity-60"
              >
                {t("profile.removeCover")}
              </button>
            )}
          </div>
          <input
            ref={coverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void pick("cover", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </Reveal>

      {/* Avatar + name */}
      <Reveal delay={60}>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-2 sm:px-6">
          <div className="relative -mt-16 sm:-mt-20">
            <span className="block rounded-full bg-surface p-1.5 shadow-pop">
              <span className="block overflow-hidden rounded-full">
                <Avatar id={profile.id} name={displayName} size={120} src={avatar} />
              </span>
            </span>
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              disabled={busyImg === "avatar"}
              aria-label={t("profile.changePhoto")}
              title={t("profile.changePhoto")}
              className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface shadow-pop transition hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
              {busyImg === "avatar" ? (
                "…"
              ) : (
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              )}
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void pick("avatar", e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">
              {displayName}
            </h1>
            <p className="truncate text-sm text-ink-muted">
              {t(roleKey(profile.role))} · {email}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">{t("profile.imageHint")}</p>
            {avatar && (
              <button
                type="button"
                onClick={() => clearImage("avatar")}
                disabled={busyImg === "avatar"}
                className="mt-1 text-xs font-semibold text-ink-muted hover:text-ink"
              >
                {t("profile.removePhoto")}
              </button>
            )}
          </div>
        </div>
      </Reveal>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
      {/* Name */}
      <Reveal delay={120}>
        <section className={`${CARD} p-5 sm:p-7`}>
          <h2 className="mb-4 text-[17px] font-semibold text-ink">{t("profile.personal")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("profile.firstName")}>
              <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" maxLength={60} />
            </Field>
            <Field label={t("profile.lastName")}>
              <input className="input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" maxLength={60} />
            </Field>
          </div>
          <div
            className="grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out"
            style={{ gridTemplateRows: dirty ? "1fr" : "0fr", opacity: dirty ? 1 : 0, visibility: dirty ? "visible" : "hidden" }}
          >
            <div className="overflow-hidden">
              <div className="flex justify-end gap-2 pt-5">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setFirst(initial.first);
                    setLast(initial.last);
                  }}
                  disabled={savingName}
                >
                  {t("profile.cancel")}
                </button>
                <button type="button" className="btn-primary" onClick={saveName} disabled={savingName || !first.trim()}>
                  {savingName ? "…" : t("profile.save")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={180}>
        <EmailCard email={email} />
      </Reveal>
      <Reveal delay={240}>
        <PasswordCard />
      </Reveal>
        </div>
      <Reveal delay={300}>
        <Appearance profile={profile} isOwner={isOwner} bgStyle={bgStyle} bgBlur={bgBlur} />
      </Reveal>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/* ------------------------------ E-mail ------------------------------ */

function EmailCard({ email }: { email: string }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(email);
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = value.trim().toLowerCase() !== email.toLowerCase();

  async function submit() {
    setBusy(true);
    const res = await changeOwnEmail({ email: value, currentPassword: current });
    setBusy(false);
    if (res?.error) return toastErr(res.error);
    setCurrent("");
    toast(t("profile.emailUpdated"), "success");
    router.refresh();
  }

  return (
    <section className={`${CARD} p-5 sm:p-7`}>
      <h2 className="mb-4 text-[17px] font-semibold text-ink">{t("profile.email")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("profile.email")}>
          <input className="input" type="email" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="email" />
        </Field>
        {changed && (
          <Field label={t("profile.currentPassword")}>
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
      </div>
      {changed && (
        <div className="flex items-center justify-between gap-3 pt-4">
          <p className="text-xs text-ink-muted">{t("profile.currentPasswordHint")}</p>
          <button type="button" className="btn-primary shrink-0" onClick={submit} disabled={busy || !current}>
            {busy ? "…" : t("profile.updateEmail")}
          </button>
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Password ----------------------------- */

function PasswordCard() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (next !== again) return setError(t("profile.passwordMismatch"));
    setBusy(true);
    const res = await changeOwnPassword({ currentPassword: current, newPassword: next });
    setBusy(false);
    if (res?.error) return setError(res.error);
    setCurrent("");
    setNext("");
    setAgain("");
    toast(t("profile.passwordUpdated"), "success");
  }

  return (
    <section className={`${CARD} p-5 sm:p-7`}>
      <h2 className="mb-4 text-[17px] font-semibold text-ink">{t("profile.password")}</h2>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <Field label={t("profile.currentPassword")}>
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label={t("profile.newPassword")}>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label={t("profile.confirmPassword")}>
          <input className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      {error && <p className="alert-error mt-4">{error}</p>}
      <div className="flex justify-end pt-4">
        <button type="button" className="btn-primary" onClick={submit} disabled={busy || !current || !next || !again}>
          {busy ? "…" : t("profile.updatePassword")}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------- Appearance ---------------------------- */

function Appearance({
  profile,
  isOwner,
  bgStyle: initialBgStyle,
  bgBlur: initialBgBlur,
}: {
  profile: Profile;
  isOwner: boolean;
  bgStyle: BackgroundStyle;
  bgBlur: number;
}) {
  const { lang, setLang, t } = useLanguage();
  const initialAccent = profile.theme_accent ?? "sky";
  const initialMode = (profile.theme_mode as ThemeMode) ?? "light";
  const [accent, setAccent] = useState(initialAccent);
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>(initialBgStyle);
  const [bgBlur, setBgBlur] = useState(initialBgBlur);
  const [saving, setSaving] = useState(false);
  const dirty =
    accent !== initialAccent || mode !== initialMode || (isOwner && (bgStyle !== initialBgStyle || bgBlur !== initialBgBlur));

  // Applied live as the person clicks; Save keeps it, Cancel puts it back.
  function pickAccent(id: string) {
    setAccent(id);
    applyTheme(id, mode);
  }
  function pickMode(id: ThemeMode) {
    setMode(id);
    applyTheme(accent, id);
  }
  function pickBgStyle(id: BackgroundStyle) {
    setBgStyle(id);
    applyBackground(id, bgBlur);
  }
  function pickBgBlur(v: number) {
    setBgBlur(v);
    applyBackground(bgStyle, v);
  }
  function cancel() {
    setAccent(initialAccent);
    setMode(initialMode);
    setBgStyle(initialBgStyle);
    setBgBlur(initialBgBlur);
    applyTheme(initialAccent, initialMode);
    applyBackground(initialBgStyle, initialBgBlur);
  }
  async function save() {
    setSaving(true);
    const res = await saveTheme(accent, mode);
    if (res?.error) {
      setSaving(false);
      return toastErr(res.error);
    }
    if (isOwner) {
      const bg = await saveBackground(bgStyle, bgBlur);
      if (bg?.error) {
        setSaving(false);
        return toastErr(bg.error);
      }
    }
    setSaving(false);
    toast(t("profile.saved"), "success");
  }

  return (
    <section className={`${CARD} space-y-5 p-5 sm:p-7`}>
      <div>
        <h2 className="text-[17px] font-semibold text-ink">{t("profile.appearance")}</h2>
        <p className="text-sm text-ink-muted">{t("profile.appearanceDesc")}</p>
      </div>

      <div>
        <p className="label">{t("shell.language")}</p>
        <div className="seg flex max-w-sm">
          {LANGUAGES.map((l) => (
            <button key={l.id} onClick={() => setLang(l.id)} className={`seg-btn min-h-[44px] flex-1 ${lang === l.id ? "seg-btn-on" : ""}`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">{t("settings.accent")}</p>
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => pickAccent(a.id)}
              title={a.label}
              className={`flex h-11 w-11 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition ${accent === a.id ? "ring-2 ring-ink" : ""}`}
              style={{ backgroundColor: a.swatch }}
            >
              {accent === a.id && <span className="text-sm font-bold text-white">✓</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">{t("settings.mode")}</p>
        <div className="seg flex max-w-sm">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => pickMode(m.id)} className={`seg-btn min-h-[44px] flex-1 ${mode === m.id ? "seg-btn-on" : ""}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="border-t border-surface-border pt-4">
          <p className="label">
            {t("settings.background")} <span className="font-normal normal-case">(applies to everyone)</span>
          </p>
          <div className="seg mb-3 flex max-w-sm">
            <button onClick={() => pickBgStyle("solid")} className={`seg-btn min-h-[44px] flex-1 ${bgStyle === "solid" ? "seg-btn-on" : ""}`}>
              Solid
            </button>
            <button onClick={() => pickBgStyle("wallpaper")} className={`seg-btn min-h-[44px] flex-1 ${bgStyle === "wallpaper" ? "seg-btn-on" : ""}`}>
              Wallpaper
            </button>
          </div>
          {bgStyle === "wallpaper" && (
            <div className="max-w-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                <span>{t("settings.blur")}</span>
                <span>{bgBlur}%</span>
              </div>
              <input type="range" min={0} max={100} value={bgBlur} onChange={(e) => pickBgBlur(Number(e.target.value))} className="w-full accent-brand-600" />
            </div>
          )}
        </div>
      )}

      <div
        className="grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out"
        style={{ gridTemplateRows: dirty ? "1fr" : "0fr", opacity: dirty ? 1 : 0, visibility: dirty ? "visible" : "hidden" }}
      >
        <div className="overflow-hidden">
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={cancel} disabled={saving}>
              {t("profile.cancel")}
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "…" : t("profile.save")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
