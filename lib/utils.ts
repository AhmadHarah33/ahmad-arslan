import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins class names; a later class overrides an earlier conflicting one.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
