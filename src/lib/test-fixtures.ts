import type { ComicDTO } from "./types";

let seq = 0;

/** Build a ComicDTO for tests; override any field. */
export function makeComic(over: Partial<ComicDTO> = {}): ComicDTO {
  seq += 1;
  return {
    id: over.id ?? `c${seq}`,
    series: "Series",
    issueNumber: "1",
    publisher: null,
    coverDate: null,
    rating: null,
    notes: null,
    imageUrl: "/img.webp",
    thumbUrl: "/thumb.webp",
    blurDataUrl: "data:,",
    width: 660,
    height: 1014,
    upscaled: false,
    position: seq,
    createdAt: seq,
    authors: [],
    artists: [],
    characters: [],
    tags: [],
    boardIds: [],
    ...over,
  };
}
