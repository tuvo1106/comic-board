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
      {/*
        Spacing here is deliberate, in three parts:

        - `px-5` matches Dialog's own header padding, so the title and the
          content share a left edge. Don't bump one without the other. Vertical
          padding is free to differ, and is larger: at 20px the last button sat
          closer to the dialog edge than the sections are to each other.
        - `space-y-5` around the rule, against the 16px inside each form. The
          line already does the separating, so it needs little space either side
          — at 28px the two sections drifted apart instead of reading as one
          panel.
        - Everything was a uniform 12px before, which is what made it feel
          cramped: no gap meant anything, so nothing grouped.
      */}
      <div className="space-y-5 px-5 py-6">
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
    // One 16px step between every group, with the heading and its context
    // tucked together at 4px.
    //
    // `min-w-40` on the submit button is shared with the password form's: the
    // two sections mirror each other, so content-sized buttons left them at
    // ~116px and ~146px, which reads as accidental rather than as two labels of
    // different lengths. It's a floor, not a fixed width — a longer label still
    // grows the button rather than being clipped.
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">Change email</h3>
        <p className="mt-1 text-xs text-muted">Current: {data?.user?.email}</p>
      </div>
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
        className="min-w-40 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
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
    <form onSubmit={submit} className="space-y-4">
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
        className="min-w-40 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
