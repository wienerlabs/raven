CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_campaign_step_unique" ON "messages" USING btree ("campaign_id","contact_id","step","channel") WHERE "messages"."is_test" = false and "messages"."status" <> 'cancelled';