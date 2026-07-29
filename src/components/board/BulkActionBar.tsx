"use client";

import { useState } from "react";
import {
  useAddToBoard,
  useBoards,
  useDeleteComic,
  useRemoveFromBoard,
  useRestoreComic,
  useUpdateComic,
} from "@/lib/client-api";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Layers, Pencil, Plus, Trash, X } from "@/components/ui/icons";

interface Props {
  comics: ComicDTO[];
  selectedIds: Set<string>;
  /** The board currently being viewed (undefined = My Comics). */
  currentBoardId?: string;
  suggestions: { publishers: string[]; tags: string[] };
  onClear: () => void;
  /** Called once a bulk action completes, to drop the selection. */
  onDone: () => void;
}

const barButtonClass =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-fg transition hover:bg-surface-2";

/**
 * Sticky action bar shown above the list view while rows are selected.
 * Every action loops an existing single-comic mutation across the selection
 * (see ROADMAP.md item 2a) — no batch endpoint yet, sequential so failures
 * are per-item and don't race the shared mutation hook's pending state.
 */
export function BulkActionBar({
  comics,
  selectedIds,
  currentBoardId,
  suggestions,
  onClear,
  onDone,
}: Props) {
  const { data: boards } = useBoards();
  const addToBoard = useAddToBoard();
  const removeFromBoard = useRemoveFromBoard();
  const updateComic = useUpdateComic();
  const deleteComic = useDeleteComic();
  const restoreComic = useRestoreComic();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ids = [...selectedIds];
  const selectedComics = comics.filter((c) => selectedIds.has(c.id));

  const addToBoardBulk = async (boardId: string) => {
    for (const id of ids) {
      try {
        await addToBoard.mutateAsync({ boardId, comicId: id });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    onDone();
  };

  const removeFromBoardBulk = async () => {
    if (!currentBoardId) return;
    for (const id of ids) {
      try {
        await removeFromBoard.mutateAsync({ boardId: currentBoardId, comicId: id });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    onDone();
  };

  const setPublisherBulk = async (publisher: string) => {
    for (const id of ids) {
      try {
        await updateComic.mutateAsync({ id, patch: { publisher } });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    onDone();
  };

  // Additive, not an overwrite: reusing updateComic's patch naively would
  // replace each comic's whole tags array. Union the new tag into each
  // comic's *own* existing list instead (see ROADMAP.md item 2a).
  const addTagBulk = async (tag: string) => {
    for (const c of selectedComics) {
      if (c.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      try {
        await updateComic.mutateAsync({ id: c.id, patch: { tags: [...c.tags, tag] } });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    onDone();
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    for (const id of ids) {
      try {
        await deleteComic.mutateAsync(id);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    const n = ids.length;
    toast(`${n} comic${n === 1 ? "" : "s"} deleted`, "success", {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          for (const id of ids) {
            restoreComic.mutate(id, { onError: (e) => toast((e as Error).message, "error") });
          }
        },
      },
    });
    onDone();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
      <span className="text-sm font-medium text-fg">{ids.length} selected</span>
      <button onClick={onClear} className="text-sm text-muted hover:text-fg">
        Clear
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Menu
          align="left"
          widthClass="w-56"
          trigger={({ toggle }) => (
            <button onClick={toggle} className={barButtonClass}>
              <Layers className="h-4 w-4" /> Add to board
            </button>
          )}
        >
          {(close) =>
            boards && boards.length > 0 ? (
              <>
                {boards.map((b) => (
                  <MenuItem
                    key={b.id}
                    onClick={() => {
                      addToBoardBulk(b.id);
                      close();
                    }}
                  >
                    {b.name}
                  </MenuItem>
                ))}
              </>
            ) : (
              <p className="px-2.5 py-1.5 text-sm text-muted">No boards yet</p>
            )
          }
        </Menu>

        {currentBoardId && (
          <button onClick={removeFromBoardBulk} className={barButtonClass}>
            <X className="h-4 w-4" /> Remove from board
          </button>
        )}

        <Menu
          align="left"
          widthClass="w-64"
          trigger={({ toggle }) => (
            <button onClick={toggle} className={barButtonClass}>
              <Pencil className="h-4 w-4" /> Set publisher
            </button>
          )}
        >
          {(close) => (
            <ApplyField
              placeholder="Publisher"
              suggestions={suggestions.publishers}
              onApply={(v) => {
                setPublisherBulk(v);
                close();
              }}
            />
          )}
        </Menu>

        <Menu
          align="left"
          widthClass="w-64"
          trigger={({ toggle }) => (
            <button onClick={toggle} className={barButtonClass}>
              <Plus className="h-4 w-4" /> Add tag
            </button>
          )}
        >
          {(close) => (
            <ApplyField
              placeholder="Tag"
              suggestions={suggestions.tags}
              onApply={(v) => {
                addTagBulk(v);
                close();
              }}
            />
          )}
        </Menu>

        <button
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          <Trash className="h-4 w-4" /> Delete
        </button>
      </div>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete comics">
        <div className="p-5">
          <p className="text-sm text-muted">
            Delete {ids.length} comic{ids.length === 1 ? "" : "s"}? This removes them from every
            board. You can undo from the toast for a few seconds after.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Delete
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** "Type a value, Enter or Apply to commit" popover body — Set publisher /
 *  Add tag share this shape. A real <form> (not Autocomplete's onCommit,
 *  which also fires on blur) so Enter-to-submit and the Apply button are one
 *  path, not two that could double-fire. */
function ApplyField({
  placeholder,
  suggestions,
  onApply,
}: {
  placeholder: string;
  suggestions: string[];
  onApply: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="p-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onApply(value.trim());
      }}
    >
      <Autocomplete
        value={value}
        onChange={setValue}
        suggestions={suggestions}
        placeholder={placeholder}
        autoFocus
        fitContent
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="mt-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
      >
        Apply
      </button>
    </form>
  );
}
