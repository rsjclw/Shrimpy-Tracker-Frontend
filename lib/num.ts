// Number parsing/formatting. The backend sends decimals as strings.

/** Parse user or API input; returns NaN for blanks and junk. Commas are thousands separators. */
export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "number") return value;
  const trimmed = value.replace(/,/g, "").trim();
  if (!trimmed) return Number.NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function has(value: string | number | null | undefined): boolean {
  return Number.isFinite(num(value));
}

/** 12,345 */
export function fmtInt(value: number | string | null | undefined): string {
  const n = num(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
}

/** Fixed decimals, en-US grouping: 1,234.5 */
export function fmtDec(value: number | string | null | undefined, digits: number): string {
  const n = num(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Up to `digits` decimals, trailing zeros dropped: 7.6, 0.04, 380 */
export function fmtNum(value: number | string | null | undefined, digits = 2): string {
  const n = num(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Rp 18,600 */
export function rupiah(value: number | string | null | undefined): string {
  const n = num(value);
  return Number.isFinite(n) ? `Rp ${Math.round(n).toLocaleString("en-US")}` : "—";
}

/** Keep digits and one dot while typing a decimal. */
export function decimalInput(value: string, maxDecimals?: number): string {
  let v = value.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  if (maxDecimals !== undefined && v.includes(".")) {
    const [a, b] = v.split(".");
    v = `${a}.${b.slice(0, maxDecimals)}`;
  }
  return v;
}

export function intInput(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** Signed with a real minus sign: +1.2, −3 */
export function signed(n: number, digits = 0): string {
  const body = digits ? Math.abs(n).toFixed(digits) : Math.round(Math.abs(n)).toLocaleString("en-US");
  return (n > 0 ? "+" : n < 0 ? "−" : "±") + body;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
