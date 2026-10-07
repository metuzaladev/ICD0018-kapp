ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_version" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "legal_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;