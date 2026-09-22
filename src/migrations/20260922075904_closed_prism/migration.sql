CREATE TABLE "search_server_scores" (
	"query_hash" varchar(64),
	"server_id" uuid,
	"score" double precision NOT NULL,
	"profile_hash" varchar(64) NOT NULL,
	"model" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_server_scores_pkey" PRIMARY KEY("query_hash","server_id")
);
--> statement-breakpoint
CREATE INDEX "search_server_scores_updated_at_idx" ON "search_server_scores" ("updated_at");--> statement-breakpoint
ALTER TABLE "search_server_scores" ADD CONSTRAINT "search_server_scores_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;