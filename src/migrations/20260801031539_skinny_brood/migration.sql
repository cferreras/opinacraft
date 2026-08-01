-- Maintenance-window migration: pause writes to server_reviews while this index is swapped.
-- Drizzle applies migrations in a transaction, so this intentionally uses the blocking
-- DROP/CREATE form rather than CREATE/DROP INDEX CONCURRENTLY.
DROP INDEX "server_reviews_one_per_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "server_reviews_one_per_user_idx" ON "server_reviews" ("server_id","user_id") WHERE "status" <> 'deleted';
