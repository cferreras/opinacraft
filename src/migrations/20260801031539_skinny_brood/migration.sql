DROP INDEX "server_reviews_one_per_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "server_reviews_one_per_user_idx" ON "server_reviews" ("server_id","user_id") WHERE "status" <> 'deleted';