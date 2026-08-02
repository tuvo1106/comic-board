"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useChromeHeight } from "@/lib/use-chrome-height";
import {
  keys,
  useBoards,
  useComics,
  useCreateBoard,
  useDeleteBoard,
  useUpdateBoard,
} from "@/lib/client-api";
import { swapReorder } from "@/lib/reorder";
import type { BoardDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { BarChart, MoreHorizontal, Pencil, Plus, Trash } from "@/components/ui/icons";

interface Props {
  activeBoardId?: string; // undefined = My Comics
}

/**
 * The view switcher: boards, plus Stats as a trailing peer.
 *
 * Keep exactly one item highlighted at all times. A strip with nothing selected
 * reads as broken, and — since every board tab carries a count — as a scope
 * selector for whatever page it sits above. Stats carries no count for the same
 * reason. Two earlier arrangements failed on this; see `ENGINEERING_NOTES.md`.
 */
export function BoardTabs({ activeBoardId }: Props) {
  // Read from the route rather than a prop: the strip is rendered by both the
  // board and the stats page, and "which view is this?" is the router's answer,
  // not something each caller should have to remember to pass.
  const onStats = usePathname() === "/stats";
  const qc = useQueryClient();
  const { data: boards } = useBoards();
  const { data: comics } = useComics();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const updateBoard = useUpdateBoard();
  const ref = useRef<HTMLDivElement>(null);
  useChromeHeight(ref, "--h-tabs");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  // Swap-on-drop, same semantics as card reorder (src/lib/reorder.ts): the
  // dragged tab and its drop target trade exact tabPosition values, every
  // other tab stays put. swapReorder works on a `position` field, so map
  // tabPosition in/out of it rather than generalizing the shared helper.
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || !boards) return;
    const positioned = boards.map((b) => ({ id: b.id, position: b.tabPosition }));
    const result = swapReorder(positioned, String(active.id), String(over.id));
    if (!result) return;
    const posById = new Map(result.updates.map((u) => [u.id, u.position]));
    qc.setQueryData<BoardDTO[]>(keys.boards, (old) =>
      old
        ?.map((b) => (posById.has(b.id) ? { ...b, tabPosition: posById.get(b.id)! } : b))
        .sort((a, b) => a.tabPosition - b.tabPosition),
    );
    for (const u of result.updates) {
      updateBoard.mutate({ id: u.id, tabPosition: u.position });
    }
  };

  const activeBoard = activeId ? boards?.find((b) => b.id === activeId) ?? null : null;

  return (
    <div
      ref={ref}
      className="sticky top-[var(--top-tabs)] z-30 border-b border-border bg-bg/80 backdrop-blur-xl"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mx-auto flex max-w-[1800px] items-center gap-1 overflow-x-auto px-5 py-1.5">
          <Tab
            href="/"
            label="My Comics"
            active={!onStats && !activeBoardId}
            count={comics?.length}
          />
          <SortableContext
            items={boards?.map((b) => b.id) ?? []}
            strategy={horizontalListSortingStrategy}
          >
            {boards?.map((b) => (
              <BoardTab
                key={b.id}
                board={b}
                active={!onStats && activeBoardId === b.id}
                dimmed={activeId === b.id}
              />
            ))}
          </SortableContext>
          <button
            onClick={() => setCreateOpen(true)}
            className="ml-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
            title="New board"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* Separates the boards (which you can create, rename, reorder and
              delete) from Stats, which is a view of them all. The `+` above is
              already a non-board member of this strip, so the precedent for
              mixing holds; the rule is the divider, not exclusion. */}
          <div aria-hidden className="mx-2 h-4 w-px flex-shrink-0 bg-border" />
          <Tab
            href="/stats"
            label="Stats"
            active={onStats}
            icon={<BarChart className="h-3.5 w-3.5" />}
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeBoard && (
            <div className="cursor-grabbing rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-fg shadow-lg ring-1 ring-border">
              {activeBoard.name}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <CreateBoardDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

/**
 * A non-draggable tab. A real `<Link>`, not a button calling `router.push`, so
 * middle-click and open-in-new-tab work and assistive tech sees a destination.
 * (The board tabs below stay buttons — they're drag handles, and an anchor
 * fights the pointer sensor.)
 */
function Tab({
  href,
  label,
  active,
  count,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-shrink-0 items-center">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
          active ? "text-fg" : "text-muted hover:text-fg"
        }`}
      >
        {icon}
        <span>{label}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted">{count}</span>
        )}
        {active && (
          <motion.div
            layoutId="active-tab"
            className="absolute inset-x-1 -bottom-1.5 h-0.5 rounded-full bg-accent"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </Link>
    </div>
  );
}

function BoardTab({
  board,
  active,
  dimmed,
}: {
  board: BoardDTO;
  active: boolean;
  dimmed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(board.name);
  // Only setNodeRef/attributes/listeners are used — like card drag
  // (Masonry.tsx's CardShell), live per-move reflow via dnd-kit's own
  // transform is intentionally skipped: the tab strip stays static during
  // drag (DragOverlay tracks the pointer instead) and reflows once, on
  // drop, via the `layout` animation below.
  const { setNodeRef, attributes, listeners } = useSortable({ id: board.id });

  const doRename = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateBoard.mutateAsync({ id: board.id, name: trimmed });
      setRenameOpen(false);
      toast("Board renamed", "success");
    } catch (e) {
      // Leave the dialog open so the user can retry or copy their input.
      toast((e as Error).message, "error");
    }
  };

  const doDelete = async () => {
    try {
      await deleteBoard.mutateAsync(board.id);
      setDeleteOpen(false);
      toast("Board deleted", "success");
      if (active) router.push("/");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      layout
      animate={{ opacity: dimmed ? 0.4 : 1 }}
      transition={{ layout: { type: "spring", stiffness: 480, damping: 42 } }}
      className="group relative flex flex-shrink-0 items-center"
      {...attributes}
      {...listeners}
    >
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
    </motion.div>
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
