import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-pop">
            M
          </div>
          <h1 className="text-xl font-bold text-ink">
            Mars Technical Support Team
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in to continue
          </p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">
          Mars Med Dent · Internal use only
        </p>
      </div>
    </main>
  );
}
