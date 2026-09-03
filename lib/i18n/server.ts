import { cookies } from "next/headers";
import {
  DEFAULT_LANGUAGE,
  DICTIONARIES,
  type Language,
  type StringKey,
} from "./dictionary";

export const LANG_COOKIE = "app_language";

// Translation for Server Components. The client provider mirrors the chosen
// language into a cookie precisely so this can read it.
export function getServerT(): (key: StringKey) => string {
  const raw = cookies().get(LANG_COOKIE)?.value;
  const lang: Language =
    raw && raw in DICTIONARIES ? (raw as Language) : DEFAULT_LANGUAGE;
  return (key) => DICTIONARIES[lang][key] ?? DICTIONARIES.en[key] ?? key;
}
