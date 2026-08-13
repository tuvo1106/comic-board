/** Client-facing shapes returned by the API. */

export interface ComicDTO {
  id: string;
  series: string;
  issueNumber: string | null;
  publisher: string | null;
  coverDate: string | null;
  rating: number | null; // 0.5–5 in 0.5 steps; null = unrated
  notes: string | null; // freeform personal annotation
  imageUrl: string; // full-size
  thumbUrl: string; // masonry thumbnail
  blurDataUrl: string;
  width: number;
  height: number;
  /** True once an upscale has been accepted — the pre-upscale cover is kept and can be restored. */
  upscaled: boolean;
  position: number; // ordering on My Comics
  createdAt: number;
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
  boardIds: string[]; // custom boards this comic belongs to
}

export interface BoardDTO {
  id: string;
  name: string;
  tabPosition: number;
  count: number;
  createdAt: number;
}

export interface MetaDTO {
  series: { value: string; count: number }[];
  publishers: { value: string; count: number }[];
  authors: { value: string; count: number }[];
  artists: { value: string; count: number }[]; // cover artists
  characters: { value: string; count: number }[];
  tags: { value: string; count: number }[];
}
