// Parse a single free-text search box ("black cat 4", "x-men #12", "asm 1.1")
// into a series name + optional issue number. A trailing number token (optionally
// #-prefixed) is treated as the issue; everything before it is the series.
//
// This is a heuristic — some titles END in a number ("Spider-Man 2099"), so the
// search route also retries with the whole string as the series when a parsed
// issue yields no matches.

export interface ParsedQuery {
  series: string;
  issue?: string;
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const q = raw.trim().replace(/\s+/g, " ");
  if (!q) return { series: "" };

  // "<series> [#]<number>" with the number as an integer or decimal (e.g. 1.1).
  const m = /^(.*\S)\s+#?(\d+(?:\.\d+)?)$/.exec(q);
  if (m) return { series: m[1].trim(), issue: m[2] };

  return { series: q };
}
