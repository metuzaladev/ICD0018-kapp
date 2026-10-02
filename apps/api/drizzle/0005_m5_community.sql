CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"messages" boolean DEFAULT true NOT NULL,
	"friend_requests" boolean DEFAULT true NOT NULL,
	"friend_plans" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Nothing wrote notifications before M5 (the table had no API), and the old title/body/text-data rows
-- would have no usable shape for the new feed, so they are cleared instead of converted.
DELETE FROM "notifications";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "data" SET DATA TYPE jsonb USING '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "data" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "direct_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "allow_friend_requests" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "language" text DEFAULT 'et' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_uq" ON "friendships" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "planned_visits_user_time_idx" ON "planned_visits" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "body";--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_key_unique" UNIQUE("direct_key");--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_not_self" CHECK ("friendships"."requester_id" <> "friendships"."addressee_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_length" CHECK (char_length("messages"."body") between 1 and 2000);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" in ('friend_request', 'friend_accepted', 'message', 'friend_plan'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_language_supported" CHECK ("user"."language" in ('et', 'en', 'ru'));--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_not_self" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id");--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reason" CHECK ("user_reports"."reason" in ('spam', 'harassment', 'other'));