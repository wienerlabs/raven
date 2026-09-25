CREATE TABLE "telegram_chats" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"contact_id" uuid NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"language_code" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_chats_contact_idx" ON "telegram_chats" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_tg_inbound_unique" ON "events" USING btree (("data"->>'id')) WHERE "events"."type" = 'tg_inbound';