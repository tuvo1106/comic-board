"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { isSortKey, type SortKey } from "./sort";

/**
 * Sort order backed by the URL (`?sort=`), so it's shareable and pairs with the
 * filter params. When `?sort=` is absent the caller's `defaultSort` applies —
 * this differs per board (My Comics defaults to cover date, custom boards to
 * manual). Selecting the default clears the param to keep the URL clean.
 */
export function useSort(defaultSort: SortKey): [SortKey, (key: SortKey) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = useMemo<SortKey>(() => {
    const v = searchParams.get("sort");
    return isSortKey(v) ? v : defaultSort;
  }, [searchParams, defaultSort]);

  const setSort = useCallback(
    (key: SortKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === defaultSort) params.delete("sort");
      else params.set("sort", key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaultSort],
  );

  return [sort, setSort];
}
