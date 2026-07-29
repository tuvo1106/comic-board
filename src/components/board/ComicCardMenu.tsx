"use client";

import { useState } from "react";
import { useDeleteComic, useRemoveFromBoard, useRestoreComic } from "@/lib/client-api";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { BoardMembershipList } from "@/components/board/BoardMembershipList";
import { MoreHorizontal, Trash, X } from "@/components/ui/icons";

interface Props {
  comic: ComicDTO;
  /** The board currently being viewed (undefined = My Comics). */
  currentBoardId?: string;
}

export function ComicCardMenu({ comic, currentBoardId }: Props) {
  const removeFromBoard = useRemoveFromBoard();
  const deleteComic = useDeleteComic();
  const restoreComic = useRestoreComic();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const removeFromCurrentBoard = async (boardId: string) => {
    try {
      await removeFromBoard.mutateAsync({ boardId, comicId: comic.id });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const doDelete = async () => {
    try {
      await deleteComic.mutateAsync(comic.id);
      const label = `${comic.series}${comic.issueNumber ? ` #${comic.issueNumber}` : ""}`;
      toast(`${label} deleted`, "success", {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            restoreComic.mutate(comic.id, {
              onError: (e) => toast((e as Error).message, "error"),
            });
          },
        },
      });
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
            <BoardMembershipList
              comicId={comic.id}
              boardIds={comic.boardIds}
              label="Add to board"
            />

            <div className="my-1 h-px bg-border" />

            {currentBoardId && comic.boardIds.includes(currentBoardId) && (
              <MenuItem
                icon={<X className="h-4 w-4" />}
                onClick={() => {
                  removeFromCurrentBoard(currentBoardId);
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
            {comic.issueNumber ? ` #${comic.issueNumber}` : ""}”? This removes it from every board.
            You can undo from the toast for a few seconds after.
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
