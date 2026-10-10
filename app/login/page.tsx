import LoginForm from "./login-form";
import { OrbitoTile } from "@/components/orbito-mark";
import { getServerT } from "@/lib/i18n/server";

export default function LoginPage() {
  const t = getServerT();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="app-bg" aria-hidden="true" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <OrbitoTile size={64} className="mx-auto mb-4 !rounded-[18px] shadow-pop" />
          <h1 className="text-xl font-bold tracking-tight text-ink">
            {t("login.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t("login.subtitle")}
          </p>
        </div>

        <div className="card rounded-3xl p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">
          {t("login.footer")}
        </p>
      </div>
    </main>
  );
}
