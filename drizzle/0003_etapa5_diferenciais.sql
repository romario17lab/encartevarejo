CREATE TABLE "ai_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'processando' NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"credits" integer DEFAULT 0 NOT NULL,
	"input_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"created_by" text NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preview_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_version" integer NOT NULL,
	"token_hash" text NOT NULL,
	"pin_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"decision" text,
	"decided_at" timestamp with time zone,
	"decided_name" text,
	"comment" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_playlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"screen_id" text NOT NULL,
	"kind" text NOT NULL,
	"campaign_id" text,
	"video_job_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"days_of_week" jsonb DEFAULT 'null'::jsonb,
	"hours" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_screens" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"pairing_code" text,
	"pairing_expires_at" timestamp with time zone,
	"device_token_hash" text,
	"paired_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_version" integer NOT NULL,
	"orientation" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_sec" integer NOT NULL,
	"status" "export_status" DEFAULT 'na_fila' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"output_asset_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "parent_asset_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "agency_org_id" text;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_links" ADD CONSTRAINT "preview_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_playlist_items" ADD CONSTRAINT "tv_playlist_items_screen_id_tv_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."tv_screens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_screens" ADD CONSTRAINT "tv_screens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_requests_org_idx" ON "ai_requests" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_uq" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_org_idx" ON "api_tokens" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preview_links_token_uq" ON "preview_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "preview_links_campaign_idx" ON "preview_links" USING btree ("org_id","campaign_id");--> statement-breakpoint
CREATE INDEX "tv_playlist_screen_idx" ON "tv_playlist_items" USING btree ("screen_id","position");--> statement-breakpoint
CREATE INDEX "tv_screens_org_idx" ON "tv_screens" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_screens_pairing_uq" ON "tv_screens" USING btree ("pairing_code");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_screens_token_uq" ON "tv_screens" USING btree ("device_token_hash");--> statement-breakpoint
CREATE INDEX "video_jobs_org_idx" ON "video_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "video_jobs_status_idx" ON "video_jobs" USING btree ("status");