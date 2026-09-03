import type { StringKey } from "./dictionary";

// A whole phrase, not "Good " + a word: Turkish has no equivalent split, and
// lowercasing an English word under a Turkish locale mangles the I.
export function greetingKey(date = new Date()): StringKey {
  const h = date.getHours();
  if (h < 12) return "dash.greetingMorning";
  if (h < 18) return "dash.greetingAfternoon";
  return "dash.greetingEvening";
}
