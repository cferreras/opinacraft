import * as z from "zod";

export const REVIEW_MIN_LENGTH = 10;
export const REVIEW_MAX_LENGTH = 2_000;
export const REVIEW_REPORT_MAX_DETAILS = 1_000;

export const reviewContentSchema = z
  .string()
  .transform(normalizeReviewContent)
  .pipe(z.string().min(REVIEW_MIN_LENGTH, `Escribe al menos ${REVIEW_MIN_LENGTH} caracteres.`).max(REVIEW_MAX_LENGTH, `La opinión no puede superar los ${REVIEW_MAX_LENGTH} caracteres.`));

export const reviewInputSchema = z.object({
  rating: z.coerce.number().int().min(1, "Elige una puntuación entre 1 y 5.").max(5, "Elige una puntuación entre 1 y 5."),
  content: reviewContentSchema,
});

export const reviewReportInputSchema = z.object({
  reason: z.enum(["spam", "harassment", "offensive", "false_information", "conflict_of_interest", "other"]),
  details: z
    .string()
    .transform((value) => value.trim().slice(0, REVIEW_REPORT_MAX_DETAILS))
    .optional(),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewReportInput = z.infer<typeof reviewReportInputSchema>;

export function normalizeReviewContent(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
