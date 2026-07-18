"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBoards, useCreateBoard, useDeleteBoard, useUpdateBoard } from "@/lib/client-api";
import type { BoardDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { MoreHorizontal, Pencil, Plus, Trash } from "@/components/ui/icons";

interface Props {
  activeBoardId?: string; // undefined = My Comics
}

export function BoardTabs({ activeBoardId }: Props) {
  const { data: boards } = useBoards();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="sticky top-[57px] z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] items-center gap-1 overflow-x-auto px-5 py-1.5">
        <Tab href="/" label="My Comics" active={!activeBoardId} pinned />
        {boards?.map((b) => (
          <BoardTab key={b.id} board={b} active={activeBoardId === b.id} />
        ))}
        <button
          onClick={() => setCreateOpen(true)}
          className="ml-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
          title="New board"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <CreateBoardDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function Tab({
  href,
  label,
  active,
  count,
  pinned,
  menu,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
  pinned?: boolean;
  menu?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="group relative flex flex-shrink-0 items-center">
      <button
        onClick={() => router.push(href)}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
          active ? "text-fg" : "text-muted hover:text-fg"
        }`}
      >
        <span>{label}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted">{count}</span>
        )}
        {menu}
        {active && (
          <motion.div
            layoutId="active-tab"
            className="absolute inset-x-1 -bottom-1.5 h-0.5 rounded-full bg-accent"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </button>
      {pinned && null}
    </div>
  );
}

function BoardTab({ board, active }: { board: BoardDTO; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(board.name);

  const doRename = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await updateBoard.mutateAsync({ id: board.id, name: trimmed });
    setRenameOpen(false);
    toast("Board renamed", "success");
  };

  const doDelete = async () => {
    await deleteBoard.mutateAsync(board.id);
    setDeleteOpen(false);
    toast("Board deleted", "success");
    if (active) router.push("/");
  };

  return (
    <div className="group relative flex flex-shrink-0 items-center">
      <button
        onClick={() => router.push(`/board/${board.id}`)}
        className={`relative flex items-center gap-1.5 rounded-md py-1.5 pl-3 pr-1 text-sm font-medium transition ${
          active ? "text-fg" : "text-muted hover:text-fg"
        }`}
      >
        <span>{board.name}</span>
        <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted">{board.count}</span>
        {active && (
          <motion.div
            layoutId="active-tab"
            className="absolute inset-x-1 -bottom-1.5 h-0.5 rounded-full bg-accent"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </button>
      <Menu
        align="left"
        widthClass="w-40"
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="mr-1 grid h-6 w-6 place-items-center rounded text-muted opacity-0 transition hover:bg-surface-2 hover:text-fg group-hover:opacity-100 aria-expanded:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => {
                setName(board.name);
                setRenameOpen(true);
                close();
              }}
            >
              Rename
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash className="h-4 w-4" />}
              onClick={() => {
                setDeleteOpen(true);
                close();
              }}
            >
              Delete
            </MenuItem>
          </>
        )}
      </Menu>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename board">
        <div className="p-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRename()}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setRenameOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={doRename}
              disabled={!name.trim() || updateBoard.isPending}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete board">
        <div className="p-5">
          <p className="text-sm text-muted">
            Delete “{board.name}”? The comics on it are not deleted — they stay in My Comics.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDeleteOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              disabled={deleteBoard.isPending}
              className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {deleteBoard.isPending ? "Deleting…" : "Delete board"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function CreateBoardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const createBoard = useCreateBoard();
  const router = useRouter();
  const { toast } = useToast();

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const board = await createBoard.mutateAsync({ name: trimmed });
      onClose();
      setName("");
      toast(`Created “${board.name}”`, "success");
      router.push(`/board/${board.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New board">
      <div className="p-5">
        <p className="mb-3 text-sm text-muted">
          Boards are curated collections. Add covers to them from any card’s menu, or save a
          filtered view as a board.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="e.g. McFarlane Covers"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!name.trim() || createBoard.isPending}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </Dialog>
  );
}
