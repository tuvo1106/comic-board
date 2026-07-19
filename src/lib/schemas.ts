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
  rating: z
    .number()
    .min(0.5)
    .max(5)
    .refine((v) => (v * 2) % 1 === 0, "Rating must be in 0.5 steps")
    .optional()
    .nullable(),
  authors: z.array(z.string().trim().min(1).max(120)).default([]),
  artists: z.array(z.string().trim().min(1).max(120)).default([]), // cover artists
  characters: z.array(z.string().trim().min(1).max(120)).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).default([]),
  boardIds: z.array(z.string()).default([]),
});
export type ComicMetaInput = z.infer<typeof comicMetaSchema>;

/**
 * PATCH /api/comics/:id — every field optional, and crucially the arrays have
 * NO `.default([])`: an absent field means "leave unchanged", not "set to
 * empty". (Deriving `.partial()` from comicMetaSchema would inherit the defaults
 * and silently wipe associations on a partial patch like `{ rating }`.)
 */
export const comicUpdateSchema = z.object({
  series: z.string().trim().min(1, "Series is required").max(200).optional(),
  issueNumber: z.string().trim().max(50).nullable().optional(),
  publisher: z.string().trim().max(120).nullable().optional(),
  coverDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd")
    .nullable()
    .optional(),
  rating: z
    .number()
    .min(0.5)
    .max(5)
    .refine((v) => (v * 2) % 1 === 0, "Rating must be in 0.5 steps")
    .nullable()
    .optional(),
  authors: z.array(z.string().trim().min(1).max(120)).optional(),
  artists: z.array(z.string().trim().min(1).max(120)).optional(),
  characters: z.array(z.string().trim().min(1).max(120)).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).optional(),
});
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
