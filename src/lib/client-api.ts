"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { signOut } from "./auth-client";
import type { BoardDTO, ComicDTO, MetaDTO } from "./types";

// ---------------------------------------------------------------------------
// Low-level fetch
// ---------------------------------------------------------------------------

// A present-but-invalid session cookie (after a BETTER_AUTH_SECRET rotation, a
// server-side session revocation, or a DB reset) sails past the middleware gate
// — which only checks cookie *presence* — but the API rejects it with 401. A
// bare redirect to /login would bounce straight back to "/" (the gate sends
// cookie-bearing requests off the auth pages), looping forever. So clear the bad
// cookie via sign-out first, then redirect, so /login actually loads. Guarded so
// a burst of concurrent 401s (comics + boards + meta) only signs out once.
let redirecting = false;
async function redirectToLogin(): Promise<void> {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  try {
    await signOut(); // best effort: expires the session cookie server-side
  } catch {
    /* head to /login regardless of whether the clear succeeded */
  }
  window.location.href = "/login";
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401 && typeof window !== "undefined") {
    await redirectToLogin();
    throw new Error("Not signed in");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const keys = {
  comics: (boardId?: string | null) => ["comics", boardId ?? "all"] as const,
  comic: (id: string) => ["comic", id] as const,
  boards: ["boards"] as const,
  meta: ["meta"] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useComics(boardId?: string | null) {
  return useQuery({
    queryKey: keys.comics(boardId),
    queryFn: () =>
      jsonFetch<ComicDTO[]>(
        boardId ? `/api/comics?board=${encodeURIComponent(boardId)}` : "/api/comics",
      ),
  });
}

export function useComic(id: string) {
  return useQuery({
    queryKey: keys.comic(id),
    queryFn: () => jsonFetch<ComicDTO>(`/api/comics/${id}`),
  });
}

export function useBoards() {
  return useQuery({ queryKey: keys.boards, queryFn: () => jsonFetch<BoardDTO[]>("/api/boards") });
}

export function useMeta() {
  return useQuery({ queryKey: keys.meta, queryFn: () => jsonFetch<MetaDTO>("/api/meta") });
}

/** Invalidate everything that a comic mutation can affect. */
function invalidateComicWorld(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["comics"] });
  qc.invalidateQueries({ queryKey: ["comic"] }); // open detail view(s)
  qc.invalidateQueries({ queryKey: keys.boards });
  qc.invalidateQueries({ queryKey: keys.meta });
}

// ---------------------------------------------------------------------------
// Comic mutations
// ---------------------------------------------------------------------------

export interface UploadArgs {
  file: File;
  meta: {
    series: string;
    issueNumber?: string | null;
    publisher?: string | null;
    coverDate?: string | null;
    rating?: number | null;
    authors: string[];
    artists: string[];
    characters: string[];
    tags: string[];
    boardIds: string[];
  };
}

export function useUploadComic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, meta }: UploadArgs) => {
      const form = new FormData();
      form.append("file", file);
      form.append("meta", JSON.stringify(meta));
      const res = await fetch("/api/comics", { method: "POST", body: form });
      if (res.status === 401 && typeof window !== "undefined") {
        await redirectToLogin();
        throw new Error("Not signed in");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Upload failed");
      }
      return (await res.json()) as ComicDTO;
    },
    onSuccess: () => invalidateComicWorld(qc),
  });
}

export interface UpdateComicArgs {
  id: string;
  patch: {
    series?: string;
    issueNumber?: string | null;
    publisher?: string | null;
    coverDate?: string | null;
    rating?: number | null;
    authors?: string[];
    artists?: string[];
    characters?: string[];
    tags?: string[];
  };
}

export function useUpdateComic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateComicArgs) =>
      jsonFetch<ComicDTO>(`/api/comics/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      // Push the fresh comic straight into the detail cache so the modal
      // reflects the edit immediately, then refresh the derived lists.
      qc.setQueryData(keys.comic(updated.id), updated);
      invalidateComicWorld(qc);
    },
  });
}

export function useDeleteComic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/comics/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateComicWorld(qc),
  });
}

export interface PositionArgs {
  id: string;
  position: number;
  boardId?: string | null;
}

export function useUpdatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, position, boardId }: PositionArgs) =>
      jsonFetch(`/api/comics/${id}/position`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position, boardId: boardId ?? null }),
      }),
    // Optimistic reordering is handled in the board component; on settle we
    // refetch the affected list to reconcile.
    onSettled: (_d, _e, vars) => qc.invalidateQueries({ queryKey: keys.comics(vars.boardId) }),
  });
}

// ---------------------------------------------------------------------------
// Board mutations
// ---------------------------------------------------------------------------

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { name: string; comicIds?: string[] }) =>
      jsonFetch<BoardDTO>("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.boards });
      qc.invalidateQueries({ queryKey: ["comics"] });
    },
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; name?: string; tabPosition?: number }) =>
      jsonFetch(`/api/boards/${args.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: args.name, tabPosition: args.tabPosition }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.boards }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/boards/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.boards });
      qc.invalidateQueries({ queryKey: ["comics"] });
    },
  });
}

export function useRenamePublisher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { from: string; to: string }) =>
      jsonFetch("/api/publishers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      }),
    // A rename can touch any comic's publisher, so refresh the comic world.
    onSuccess: () => invalidateComicWorld(qc),
  });
}

export function useAddToBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { boardId: string; comicId: string }) =>
      jsonFetch(`/api/boards/${args.boardId}/comics/${args.comicId}`, { method: "PUT" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comics"] });
      qc.invalidateQueries({ queryKey: keys.boards });
    },
  });
}

export function useRemoveFromBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { boardId: string; comicId: string }) =>
      jsonFetch(`/api/boards/${args.boardId}/comics/${args.comicId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comics"] });
      qc.invalidateQueries({ queryKey: keys.boards });
    },
  });
}
