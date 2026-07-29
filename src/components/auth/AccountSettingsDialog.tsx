"use client";

import { useState } from "react";
import { changeEmail, changePassword, useSession } from "@/lib/auth-client";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Eye, EyeOff } from "@/components/ui/icons";

export function AccountSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Account settings">
      <div className="space-y-5 p-5">
        <ChangeEmailForm />
        <div className="h-px bg-border" />
        <ChangePasswordForm />
      </div>
    </Dialog>
  );
}

function ChangeEmailForm() {
  const { data } = useSession();
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await changeEmail({ newEmail: newEmail.trim() });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't update email");
      return;
    }
    toast("Email updated", "success");
    setNewEmail("");
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-semibold text-fg">Change email</h3>
      <p className="text-xs text-muted">Current: {data?.user?.email}</p>
      <Field
        label="New email"
        type="email"
        value={newEmail}
        onChange={setNewEmail}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy || !newEmail.trim()}
        className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update email"}
      </button>
    </form>
  );
}

function ChangePasswordForm() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't update password");
      return;
    }
    toast("Password updated", "success");
    setCurrentPassword("");
    setNewPassword("");
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShowPasswords((s) => !s)}
      aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
      aria-pressed={showPasswords}
      className="grid h-6 w-6 place-items-center rounded text-muted transition hover:text-fg"
    >
      {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-semibold text-fg">Change password</h3>
      <Field
        label="Current password"
        type={showPasswords ? "text" : "password"}
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        type={showPasswords ? "text" : "password"}
        value={newPassword}
        onChange={setNewPassword}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        required
        trailing={toggle}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy || !currentPassword || newPassword.length < 8}
        className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
