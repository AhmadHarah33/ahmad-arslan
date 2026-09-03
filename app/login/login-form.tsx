"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Session is stored in cookies; the device stays remembered by default.
    // (The "remember" toggle is here for clarity — sessions persist regardless
    // because refresh tokens rotate. Unchecking is a hint for shared devices.)
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          {t("login.email")}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          className="input"
          placeholder="you@marsmeddent.local"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          {t("login.password")}
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="input pr-11"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {/* The passwords here are hyphen-grouped strings typed on a Turkish
              keyboard — being able to see what actually landed in the field is
              the difference between one attempt and three. */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
            title={t(showPassword ? "login.hidePassword" : "login.showPassword")}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-faint transition hover:text-ink"
          >
            {showPassword ? (
              <EyeOffIcon className="h-[18px] w-[18px]" />
            ) : (
              <EyeIcon className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-400"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        {t("login.remember")}
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? t("login.signingIn") : t("login.submit")}
      </button>
    </form>
  );
}

function EyeIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.3 17.3 0 0 1-3 4M6.3 7.6C3.7 9.2 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </svg>
  );
}
