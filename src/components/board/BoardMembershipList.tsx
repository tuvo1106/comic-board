"use client";

import { useAddToBoard, useBoards, useRemoveFromBoard } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Check, Layers } from "@/components/ui/icons";

interface Props {
  comicId: string;
  /** Board ids the comic currently belongs to. */
  boardIds: string[];
  /** Header text above the checkbox list. */
  label?: string;
}

/**
 * The checkbox list of boards for a comic, with add/remove mutations. Shared by
 * the detail modal's "Add to board" menu and the grid card menu.
 */
export function BoardMembershipList({ comicId, boardIds, label = "Boards" }: Props) {
  const { data: boards } = useBoards();
  const addToBoard = useAddToBoard();
  const removeFromBoard = useRemoveFromBoard();
  const { toast } = useToast();

  const toggle = async (boardId: string, isMember: boolean) => {
    try {
      if (isMember) await removeFromBoard.mutateAsync({ boardId, comicId });
      else await addToBoard.mutateAsync({ boardId, comicId });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Layers className="h-3.5 w-3.5" /> {label}
      </p>
      <div className="max-h-52 overflow-y-auto">
        {boards && boards.length > 0 ? (
          boards.map((b) => {
            const isMember = boardIds.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggle(b.id, isMember)}
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
    </>
  );
}
