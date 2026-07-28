// Pure helpers shared by both providers. Kept side-effect-free so the mapping
// logic (the risky part) is unit-testable against saved fixtures without touching
// the network. See PROVIDERS.md for the raw shapes these consume.

// A writer-ish role feeds `authors`; a cover role feeds `artists` (cover
// artists). Metron labels the writer "Script"/"Plot". Compared case-insensitively.
const WRITER_ROLES = ["writer", "script", "plot"];
const COVER_ROLES = ["cover"];

function hasRole(roles: string[], match: string[]): boolean {
  return roles.some((r) => match.includes(r.trim().toLowerCase()));
}

export const isWriterRole = (roles: string[]) => hasRole(roles, WRITER_ROLES);
export const isCoverRole = (roles: string[]) => hasRole(roles, COVER_ROLES);

/**
 * Coerce a provider cover date to a strict `yyyy-mm-dd` (what the comic schema
 * accepts) or null. Handles day/month `00` sentinels and partial dates.
 */
export function normalizeCoverDate(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();

  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (full) {
    const [, y, moRaw, dRaw] = full;
    // Sources use "00" to mean "unknown day/month" — clamp to the 1st.
    const mo = moRaw === "00" ? "01" : moRaw;
    const d = dRaw === "00" ? "01" : dRaw;
    // Reject impossible calendar dates (e.g. 1963-02-31) — a real Date rolls
    // over rather than round-tripping, so require it to match exactly.
    if (!isRealDate(Number(y), Number(mo), Number(d))) return null;
    return `${y}-${mo}-${d}`;
  }

  const ym = /^(\d{4})-(\d{2})$/.exec(s);
  if (ym) {
    const mo = ym[2] === "00" ? "01" : ym[2];
    if (Number(mo) < 1 || Number(mo) > 12) return null;
    return `${ym[1]}-${mo}-01`;
  }

  const y = /^(\d{4})$/.exec(s);
  if (y) return `${y[1]}-01-01`;

  return null;
}

/** True only if (year, month, day) is a real calendar date (no rollover). */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

/** Trim, drop blanks, de-dupe case-insensitively, preserve first-seen order. */
export function cleanNames(names: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const t = (n ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Parse a provider year that may arrive as a number or a string like "1963". */
export function toYear(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const m = /^(\d{4})/.exec(raw.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
