CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'armazenado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "email_outbox" USING btree ("created_at");