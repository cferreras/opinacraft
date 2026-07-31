UPDATE "tags" AS child
SET "alias_of" = NULL
WHERE "alias_of" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "tags" AS parent WHERE parent."id" = child."alias_of");--> statement-breakpoint
ALTER TABLE "tags" VALIDATE CONSTRAINT "tags_alias_of_tags_id_fkey";
