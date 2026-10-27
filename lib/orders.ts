// "ORD-0007" — the number the database hands out, padded for reading.
export function orderCode(n: number | string): string {
  return `ORD-${String(n).padStart(4, "0")}`;
}
