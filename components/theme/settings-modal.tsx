"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import { ACCENTS, MODES, applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { saveTheme } from "@/app/(app)/settings/actions";
import { createClient } from "@/lib/supabase/client";
import { PREVIEW } from "@/lib/preview";
import { toastErr } from "@/lib/toast";

export default function SettingsModal({
  initialAccent,
  initialMode,
  onClose,
}: {
  initialAccent: string;
  initialMode: ThemeMode;
  onClose: () => void;
}) {
  const [accent, setAccent] = useState(initialAccent || "sky");
  const [mode, setMode] = useState<ThemeMode>(initialMode || "system");
  const [saving, setSaving] = useState(false);

  // Live preview: apply immediately as the user clicks.
  function pickAccent(id: string) {
    setAccent(id);
    applyTheme(id, mode);
  }
  function pickMode(id: ThemeMode) {
    setMode(id);
    applyTheme(accent, id);
  }

  async function save() {
    setSaving(true);
    applyTheme(accent, mode);
    const res = await saveTheme(accent, mode);
    setSaving(false);
    if (res?.error) {
      toastErr(res.error);
      return;
    }
    onClose();
  }

  return (
    <Modal title="Appearance" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="label">Accent color</p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => pickAccent(a.id)}
                title={a.label}
                className={`flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition ${
                  accent === a.id ? "ring-2 ring-ink" : ""
                }`}
                style={{ backgroundColor: a.swatch }}
              >
                {accent === a.id && (
                  <span className="text-sm font-bold text-white">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Mode</p>
          <div className="flex rounded-xl border border-surface-border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => pickMode(m.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  mode === m.id
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="border-t border-surface-border pt-4">
          <PasswordChange />
        </div>
      </div>
    </Modal>
  );
}

function PasswordChange() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function change() {
    if (pw.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setMsg(null);
    if (PREVIEW) {
      setBusy(false);
      setMsg("Not available in preview mode.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setPw("");
    setMsg("Password updated.");
  }

  return (
    <div>
      <p className="label">Change password</p>
      <div className="flex gap-2">
        <input
          type="password"
          className="input"
          placeholder="New password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
        />
        <button className="btn-ghost shrink-0" onClick={change} disabled={busy}>
          {busy ? "…" : "Update"}
        </button>
      </div>
      {msg && <p className="mt-1.5 text-xs text-ink-muted">{msg}</p>}
    </div>
  );
}
