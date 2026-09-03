"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LANGUAGE,
  DICTIONARIES,
  type Language,
  type StringKey,
} from "./dictionary";

export const LANG_STORAGE_KEY = "app_language";
export const LANG_COOKIE = "app_language";

// Mirrored into a cookie as well as localStorage: Server Components (the
// dashboard, the print view) render on the server and cannot read
// localStorage, so the cookie is the only way they can pick up the choice.
function writeCookie(lang: Language) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

type Ctx = {
  lang: Language;
  setLang: (next: Language) => void;
  t: (key: StringKey) => string;
};

const LanguageContext = createContext<Ctx>({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (key) => DICTIONARIES[DEFAULT_LANGUAGE][key],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start from the default so the server and the first client render
  // agree; the stored choice is applied in the effect below. Anything else
  // hydration-mismatches, because localStorage does not exist on the server.
  const router = useRouter();
  const [lang, setLangState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored && stored in DICTIONARIES) {
        setLangState(stored as Language);
        writeCookie(stored as Language);
      }
    } catch {
      /* private-mode storage; keep the default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (next: Language) => {
      setLangState(next);
      try {
        localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      writeCookie(next);
      // Server Components already rendered with the old language; refresh so
      // they re-render with the new one.
      router.refresh();
    },
    [router]
  );

  const t = useCallback(
    (key: StringKey) => DICTIONARIES[lang][key] ?? DICTIONARIES.en[key] ?? key,
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Shorthand for components that only need to translate. */
export function useT() {
  return useContext(LanguageContext).t;
}
