"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { EMPTY_FILTERS, filtersFromParams, filtersToParams, type Filters } from "./filters";

/**
 * Filter state backed by the URL query string, so views are shareable and the
 * back button works. Updates use router.replace with scroll disabled to keep
 * the board from jumping during a filter change.
 */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<Filters>(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilters = useCallback(
    (next: Filters) => {
      const params = filtersToParams(next, new URLSearchParams(searchParams.toString()));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const update = useCallback(
    (patch: Partial<Filters>) => setFilters({ ...filters, ...patch }),
    [filters, setFilters],
  );

  const clear = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  const toggle = useCallback(
    (
      key: "series" | "publishers" | "authors" | "artists" | "characters" | "tags",
      value: string,
    ) => {
      const current = filters[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      update({ [key]: next } as Partial<Filters>);
    },
    [filters, update],
  );

  return { filters, setFilters, update, clear, toggle };
}
