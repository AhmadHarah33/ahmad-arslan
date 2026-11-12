import fs from "fs";
import path from "path";
import LoginForm from "./login-form";
import { MarsTile } from "@/components/mars-mark";
import MarsPlanet from "@/components/mars-planet";
import { getServerT } from "@/lib/i18n/server";

// A real Mars photo wins when one is dropped in public/bg/mars.webp; until then
// the drawn planet is shown.
const PHOTO = "/bg/mars.webp";
const hasPhoto = () => fs.existsSync(path.join(process.cwd(), "public", PHOTO));

export default function LoginPage() {
  const t = getServerT();
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-2">
      <section className="relative flex flex-col px-6 py-10 sm:px-10">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[360px]">
            <div className="mb-8 text-center">
              <MarsTile size={88} className="mx-auto mb-6 rounded-[20px] shadow-pop" />
              <h1 className="text-[30px] font-semibold tracking-tight text-ink">
                {t("login.welcome")}
              </h1>
              <p className="mt-2 text-base text-ink-muted">{t("login.details")}</p>
            </div>
            <LoginForm />
          </div>
        </div>
        <p className="text-sm text-ink-faint">{t("login.footer")}</p>
      </section>

      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        {hasPhoto() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={PHOTO} alt="" className="absolute inset-0 h-full w-full bg-black object-cover object-[50%_25%]" />
        ) : (
          <MarsPlanet className="absolute inset-0 h-full w-full" />
        )}
      </aside>
    </main>
  );
}
