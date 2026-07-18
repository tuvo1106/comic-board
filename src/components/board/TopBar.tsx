"use client";

import { Search, Upload } from "@/components/ui/icons";

interface Props {
  search: string;
  onSearch: (value: string) => void;
  onUpload: () => void;
}

export function TopBar({ search, onSearch, onUpload }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg font-black">
            C
          </div>
          <h1 className="text-lg font-bold tracking-tight">Comic Board</h1>
        </div>

        <div className="relative ml-2 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search series, artists, characters…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={onUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-95"
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
      </div>
    </header>
  );
}
