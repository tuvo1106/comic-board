"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Field } from "@/components/ui/Field";
import { Check, Eye, EyeOff } from "@/components/ui/icons";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = isSignup
      ? await signUp.email({ name: name.trim() || email.split("@")[0], email, password })
      : await signIn.email({ email, password, rememberMe });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-black text-accent-fg">
            C
          </div>
          <span className="text-lg font-bold">Comic Board</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-2xl">
          <h1 className="text-lg font-semibold">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isSignup ? "Start your comic collection." : "Sign in to your collection."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {isSignup && (
              <Field
                label="Name"
                type="text"
                value={name}
                onChange={setName}
                placeholder="Optional"
                autoComplete="name"
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={setPassword}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="grid h-6 w-6 place-items-center rounded text-muted transition hover:text-fg"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {!isSignup && (
              <label className="flex cursor-pointer select-none items-center gap-2.5 pt-0.5">
                <span
                  className={`grid h-5 w-5 place-items-center rounded border transition ${
                    rememberMe ? "border-accent bg-accent text-accent-fg" : "border-border"
                  }`}
                >
                  {rememberMe && <Check className="h-3.5 w-3.5" />}
                </span>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <span className="text-sm text-muted">Keep me signed in</span>
              </label>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy || !email || password.length < 1}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Please wait…" : isSignup ? "Sign up" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="font-medium text-accent hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
