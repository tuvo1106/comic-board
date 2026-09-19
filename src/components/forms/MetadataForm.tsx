"use client";

import { useMeta } from "@/lib/client-api";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { TagInput } from "@/components/ui/TagInput";

export interface ComicFormValue {
  series: string;
  issueNumber: string;
  publisher: string;
  coverDate: string; // yyyy-mm-dd or ""
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
  notes: string;
}

export const EMPTY_FORM: ComicFormValue = {
  series: "",
  issueNumber: "",
  publisher: "",
  coverDate: "",
  authors: [],
  artists: [],
  characters: [],
  tags: [],
  notes: "",
};

interface Props {
  value: ComicFormValue;
  onChange: (value: ComicFormValue) => void;
  /** Field to focus once the form mounts (set when the user clicked directly
   *  on a display-mode field rather than the global Edit button). */
  focusField?: keyof ComicFormValue | null;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
      {required && <span className="text-accent-text"> *</span>}
    </label>
  );
}

export function MetadataForm({ value, onChange, focusField }: Props) {
  const { data: meta } = useMeta();
  const set = <K extends keyof ComicFormValue>(key: K, v: ComicFormValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div>
        <Label required>Series</Label>
        <Autocomplete
          value={value.series}
          onChange={(v) => set("series", v)}
          suggestions={(meta?.series ?? []).map((s) => s.value)}
          placeholder="e.g. The Amazing Spider-Man"
          autoFocus={focusField === "series"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Issue #</Label>
          <input
            value={value.issueNumber}
            onChange={(e) => set("issueNumber", e.target.value)}
            placeholder="14"
            autoFocus={focusField === "issueNumber"}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted"
          />
        </div>
        <div>
          <Label>Cover date</Label>
          <input
            type="date"
            value={value.coverDate ?? ""}
            onChange={(e) => set("coverDate", e.target.value)}
            autoFocus={focusField === "coverDate"}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent [color-scheme:dark]"
          />
        </div>
      </div>

      <div>
        <Label>Publisher</Label>
        <Autocomplete
          value={value.publisher}
          onChange={(v) => set("publisher", v)}
          suggestions={(meta?.publishers ?? []).map((p) => p.value)}
          placeholder="e.g. Marvel, DC"
          autoFocus={focusField === "publisher"}
        />
      </div>

      <div>
        <Label>Author</Label>
        <TagInput
          values={value.authors}
          onChange={(v) => set("authors", v)}
          suggestions={(meta?.authors ?? []).map((a) => a.value)}
          placeholder="Writer — add and press Enter"
          autoFocus={focusField === "authors"}
        />
      </div>

      <div>
        <Label>Cover Artists</Label>
        <TagInput
          values={value.artists}
          onChange={(v) => set("artists", v)}
          suggestions={(meta?.artists ?? []).map((a) => a.value)}
          placeholder="Add an artist and press Enter"
          autoFocus={focusField === "artists"}
        />
      </div>

      <div>
        <Label>Characters on cover</Label>
        <TagInput
          values={value.characters}
          onChange={(v) => set("characters", v)}
          suggestions={(meta?.characters ?? []).map((c) => c.value)}
          placeholder="Add a character and press Enter"
          autoFocus={focusField === "characters"}
        />
      </div>

      <div>
        <Label>Tags</Label>
        <TagInput
          values={value.tags}
          onChange={(v) => set("tags", v)}
          suggestions={(meta?.tags ?? []).map((t) => t.value)}
          placeholder="e.g. facsimile, homage, key issue"
          autoFocus={focusField === "tags"}
        />
      </div>

      <div>
        <Label>Notes</Label>
        <textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Add personal notes here..."
          rows={3}
          autoFocus={focusField === "notes"}
          className="w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted"
        />
      </div>
    </div>
  );
}
