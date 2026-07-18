import { z } from "zod";

/** Metadata portion of an upload (image is sent separately as multipart). */
export const comicMetaSchema = z.object({
  series: z.string().trim().min(1, "Series is required").max(200),
  issueNumber: z.string().trim().max(50).optional().nullable(),
  publisher: z.string().trim().max(120).optional().nullable(),
  coverDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd")
    .optional()
    .nullable(),
  authors: z.array(z.string().trim().min(1).max(120)).default([]),
  artists: z.array(z.string().trim().min(1).max(120)).default([]), // cover artists
  characters: z.array(z.string().trim().min(1).max(120)).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).default([]),
  boardIds: z.array(z.string()).default([]),
});
export type ComicMetaInput = z.infer<typeof comicMetaSchema>;

/** PATCH /api/comics/:id — all fields optional. */
export const comicUpdateSchema = comicMetaSchema
  .omit({ boardIds: true })
  .partial();
export type ComicUpdateInput = z.infer<typeof comicUpdateSchema>;

export const positionUpdateSchema = z.object({
  position: z.number().finite(),
  boardId: z.string().nullable().optional(), // null/absent = My Comics
});

export const boardCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  comicIds: z.array(z.string()).optional(), // save-view-as-board
});

export const boardUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tabPosition: z.number().finite().optional(),
});
