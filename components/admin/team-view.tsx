"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, UserRole } from "@/lib/types";
import { createUser, updateProfile } from "@/app/(app)/admin/actions";
import Modal from "@/components/modal";

export default function TeamView({
  me,
  members,
}: {
  me: Profile;
  members: Profile[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink md:text-2xl">Team</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage accounts and edit permissions
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          + Add member
        </button>
      </div>

      <div className="card divide-y divide-surface-border overflow-hidden">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isSelf={m.id === me.id}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {addOpen && (
        <AddMemberModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  onChanged,
}: {
  member: Profile;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setRole(role: UserRole) {
    setBusy(true);
    await updateProfile(member.id, { role });
    setBusy(false);
    onChanged();
  }

  async function toggleEdit() {
    setBusy(true);
    await updateProfile(member.id, { can_edit: !member.can_edit });
    setBusy(false);
    onChanged();
  }

  const isHead = member.role === "head";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          {member.full_name || "Unnamed"}
          {isSelf && <span className="ml-2 text-xs text-ink-faint">(you)</span>}
        </p>
        <p className="text-xs capitalize text-ink-faint">
          {isHead ? "Head of engineers" : "Engineer"}
        </p>
      </div>

      {/* Edit-data grant (not shown for head — they always can) */}
      {!isHead && (
        <button
          onClick={toggleEdit}
          disabled={busy}
          className={`chip ${
            member.can_edit
              ? "bg-green-50 text-green-700"
              : "bg-surface-soft text-ink-faint"
          }`}
        >
          {member.can_edit ? "Can edit data" : "View only"}
        </button>
      )}

      {/* Role toggle (can't demote yourself) */}
      {!isSelf && (
        <select
          value={member.role}
          disabled={busy}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-sm"
        >
          <option value="engineer">Engineer</option>
          <option value="head">Head</option>
        </select>
      )}
    </div>
  );
}

function AddMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("engineer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await createUser({
      email,
      password,
      full_name: fullName,
      role,
    });
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onCreated();
  }

  return (
    <Modal title="Add team member" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Ahmed Hassan"
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="engineer@marsmeddent.local"
          />
        </div>
        <div>
          <label className="label">Temporary password</label>
          <input
            type="text"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>
        <div>
          <label className="label">Role</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="engineer">Engineer</option>
            <option value="head">Head of engineers</option>
          </select>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
