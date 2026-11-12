"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, UserRole } from "@/lib/types";
import { createUser, deleteUser, updateProfile, updateUser } from "@/app/(app)/admin/actions";
import { isManager } from "@/lib/permissions";
import { useT } from "@/lib/i18n/provider";
import { roleKey } from "@/lib/i18n/roles";
import type { StringKey } from "@/lib/i18n/dictionary";
import Modal from "@/components/modal";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/ui";
import { useAction } from "@/lib/use-action";

export default function TeamView({
  me,
  members,
  emails,
}: {
  me: Profile;
  members: Profile[];
  emails: Record<string, string>;
}) {
  const t = useT();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title={t("team.title")}
        subtitle={t("team.subtitle")}
        action={
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            {t("team.addMember")}
          </button>
        }
      />

      <div className="card divide-y divide-surface-border overflow-hidden">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isSelf={m.id === me.id}
            email={emails[m.id] ?? ""}
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
  email,
  onChanged,
}: {
  member: Profile;
  isSelf: boolean;
  email: string;
  onChanged: () => void;
}) {
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const { run: remove, pending: removing } = useAction(deleteUser, {
    onSuccess: onChanged,
  });

  function confirmDelete() {
    const name = member.full_name || email || t("team.unnamed");
    if (window.confirm(`${t("team.confirmDelete")}\n\n${name}`)) void remove(member.id);
  }

  // Previously these ignored the result entirely, so a rejected role change
  // (e.g. RLS denial) silently looked like it had worked until the refresh
  // put the old value back. useAction surfaces it as a toast.
  const { run: save, pending: busy } = useAction(updateProfile, {
    onSuccess: onChanged,
  });

  const setRole = (role: UserRole) => save(member.id, { role });
  const toggleEdit = () => save(member.id, { can_edit: !member.can_edit });

  // Head and organizer always have full data access, so the per-person grant
  // is meaningless for them.
  const manager = isManager(member);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar
        id={member.id}
        name={member.full_name || member.first_name || "?"}
        size={36}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          {member.full_name || t("team.unnamed")}
          {isSelf && <span className="ml-2 text-xs text-ink-faint">{t("team.you")}</span>}
        </p>
        <p className="truncate text-xs text-ink-faint">
          {t(roleKey(member.role))}
          {email && <span> · {email}</span>}
        </p>
      </div>

      {/* Edit-data grant (not shown for managers — they always can) */}
      {!manager && (
        <button
          onClick={toggleEdit}
          disabled={busy}
          className={`chip ${
            member.can_edit
              ? "bg-green-50 text-green-700"
              : "bg-surface-soft text-ink-faint"
          }`}
        >
          {member.can_edit ? t("team.canEdit") : t("team.viewOnly")}
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
          <option value="engineer">{t("role.engineer")}</option>
          <option value="organizer">{t("role.organizer")}</option>
          <option value="head">{t("role.head")}</option>
        </select>
      )}

      <button onClick={() => setEditOpen(true)} className="btn-ghost !px-3 !py-1.5">
        {t("team.edit")}
      </button>
      {!isSelf && (
        <button
          onClick={confirmDelete}
          disabled={removing}
          className="btn-danger !px-3 !py-1.5"
        >
          {t("common.delete")}
        </button>
      )}

      {editOpen && (
        <EditMemberModal
          member={member}
          email={email}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function EditMemberModal({
  member,
  email: initialEmail,
  onClose,
  onSaved,
}: {
  member: Profile;
  email: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [fullName, setFullName] = useState(member.full_name);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const {
    run,
    pending: saving,
    error,
  } = useAction(updateUser, { inline: true, onSuccess: onSaved });

  return (
    <Modal
      title={t("team.editTitle")}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button
            className="btn-primary"
            onClick={() => run(member.id, { full_name: fullName, email, password })}
            disabled={saving}
          >
            {saving ? t("notes.saving") : t("common.save")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">{t("team.fullName")}</label>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">{t("login.email")}</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">{t("team.newPassword")}</label>
          <input
            type="text"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("team.passwordPlaceholder")}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-ink-faint">{t("team.newPasswordHint")}</p>
        </div>
        {error && <p className="alert-error">{error}</p>}
      </div>
    </Modal>
  );
}

function AddMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("engineer");
  // inline: the modal renders the message under the form instead of toasting,
  // since the user needs to see it next to the field they have to fix.
  const {
    run,
    pending: saving,
    error,
  } = useAction(createUser, { inline: true, onSuccess: onCreated });

  const submit = () => run({ email, password, full_name: fullName, role });

  return (
    <Modal
      title={t("team.addMemberTitle")}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? t("team.creating") : t("team.create")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">{t("team.fullName")}</label>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("team.namePlaceholder")}
          />
        </div>
        <div>
          <label className="label">{t("login.email")}</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="engineer@marsmeddent.local"
          />
        </div>
        <div>
          <label className="label">{t("team.tempPassword")}</label>
          <input
            type="text"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("team.passwordPlaceholder")}
          />
        </div>
        <div>
          <label className="label">{t("team.role")}</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="engineer">{t("role.engineer")}</option>
            <option value="organizer">{t("role.organizer")}</option>
            <option value="head">{t("role.head")}</option>
          </select>
          <p className="mt-1.5 text-xs text-ink-faint">{t(ROLE_HINTS[role])}</p>
        </div>

        {error && (
          <p className="alert-error">{error}</p>
        )}
      </div>
    </Modal>
  );
}

const ROLE_HINTS: Record<UserRole, StringKey> = {
  engineer: "team.hintEngineer",
  organizer: "team.hintOrganizer",
  head: "team.hintHead",
};
