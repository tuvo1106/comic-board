"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { NATURAL_DIR, isSortDir, isSortField, type SortDir, type SortField } from "./sort";

export interface SortState {
  field: SortField;
  dir: SortDir;
  /** Choose a field; choosing the current field toggles the direction. */
  setSort: (field: SortField) => void;
}

/**
 * Sort field + direction, backed by the URL (`?sort=` / `?dir=`) so it's
 * shareable and pairs with filters. Absent `sort` = the caller's `defaultField`
 * (My Comics → cover date, custom boards → manual); absent `dir` = the field's
 * natural direction. Both are omitted from the URL when at their defaults.
 */
export function useSort(defaultField: SortField): SortState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const field = useMemo<SortField>(() => {
    const v = searchParams.get("sort");
    return isSortField(v) ? v : defaultField;
  }, [searchParams, defaultField]);

  const dir = useMemo<SortDir>(() => {
    const v = searchParams.get("dir");
    return isSortDir(v) ? v : NATURAL_DIR[field];
  }, [searchParams, field]);

  const setSort = useCallback(
    (next: SortField) => {
      const nextDir: SortDir =
        next === field ? (dir === "asc" ? "desc" : "asc") : NATURAL_DIR[next];

      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultField) params.delete("sort");
      else params.set("sort", next);
      if (nextDir === NATURAL_DIR[next]) params.delete("dir");
      else params.set("dir", nextDir);

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, field, dir, defaultField],
  );

  return { field, dir, setSort };
}
