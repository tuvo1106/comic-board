"use client";

import { useState } from "react";
import {
  useAddToBoard,
  useBoards,
  useDeleteComic,
  useRemoveFromBoard,
} from "@/lib/client-api";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Check, Layers, MoreHorizontal, Trash, X } from "@/components/ui/icons";

interface Props {
  comic: ComicDTO;
  /** The board currently being viewed (undefined = My Comics). */
  currentBoardId?: string;
}

export function ComicCardMenu({ comic, currentBoardId }: Props) {
  const { data: boards } = useBoards();
  const addToBoard = useAddToBoard();
  const removeFromBoard = useRemoveFromBoard();
  const deleteComic = useDeleteComic();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleBoard = async (boardId: string, isMember: boolean) => {
    try {
      if (isMember) await removeFromBoard.mutateAsync({ boardId, comicId: comic.id });
      else await addToBoard.mutateAsync({ boardId, comicId: comic.id });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const doDelete = async () => {
    try {
      await deleteComic.mutateAsync(comic.id);
      toast("Cover deleted", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setConfirmDelete(false);
  };

  return (
    <>
      <Menu
        align="right"
        widthClass="w-56"
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="grid h-8 w-8 place-items-center rounded-lg bg-black/50 text-white shadow-md backdrop-blur transition hover:bg-black/70"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Layers className="h-3.5 w-3.5" /> Add to board
            </p>
            <div className="max-h-52 overflow-y-auto">
              {boards && boards.length > 0 ? (
                boards.map((b) => {
                  const isMember = comic.boardIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleBoard(b.id, isMember)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-surface-2"
                    >
                      <span
                        className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${
                          isMember ? "border-accent bg-accent text-accent-fg" : "border-border"
                        }`}
                      >
                        {isMember && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{b.name}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2.5 py-1.5 text-sm text-muted">No boards yet</p>
              )}
            </div>

            <div className="my-1 h-px bg-border" />

            {currentBoardId && comic.boardIds.includes(currentBoardId) && (
              <MenuItem
                icon={<X className="h-4 w-4" />}
                onClick={() => {
                  toggleBoard(currentBoardId, true);
                  close();
                }}
              >
                Remove from this board
              </MenuItem>
            )}
            <MenuItem
              danger
              icon={<Trash className="h-4 w-4" />}
              onClick={() => {
                setConfirmDelete(true);
                close();
              }}
            >
              Delete comic
            </MenuItem>
          </>
        )}
      </Menu>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete cover">
        <div className="p-5">
          <p className="text-sm text-muted">
            Delete “{comic.series}
            {comic.issueNumber ? ` #${comic.issueNumber}` : ""}”? This removes it from every board
            and cannot be undone.
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
              disabled={deleteComic.isPending}
              className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {deleteComic.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
