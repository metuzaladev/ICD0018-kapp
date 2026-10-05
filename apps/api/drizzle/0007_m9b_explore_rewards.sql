CREATE TYPE "public"."place_amenity" AS ENUM('dogs_inside', 'water_bowl', 'terrace', 'dog_treats', 'fenced_area', 'off_leash', 'shade', 'stream');--> statement-breakpoint
CREATE TYPE "public"."place_category" AS ENUM('cafe', 'park', 'beach', 'shop', 'other');--> statement-breakpoint
CREATE TYPE "public"."place_post_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('food', 'treats', 'toys', 'accessories', 'care');--> statement-breakpoint
CREATE TYPE "public"."redemption_offer_type" AS ENUM('booking', 'product');--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('active', 'used', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reward_reason" AS ENUM('check_in', 'plan_honoured', 'place_post', 'review', 'invite', 'streak', 'redemption', 'redemption_refund');--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "partner_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "product_category" NOT NULL,
	"price_cents" integer NOT NULL,
	"image_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"discount_percent" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_products_price_nonnegative" CHECK ("partner_products"."price_cents" >= 0),
	CONSTRAINT "partner_products_discount_range" CHECK ("partner_products"."discount_percent" between 1 and 15)
);
--> statement-breakpoint
CREATE TABLE "place_post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "place_post_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"image_key" text NOT NULL,
	"thumbnail_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_post_photos_position" CHECK ("place_post_photos"."position" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "place_post_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"reporter_id" text,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_post_reports_reason" CHECK ("place_post_reports"."reason" in ('spam', 'inappropriate', 'wrong_info', 'other'))
);
--> statement-breakpoint
CREATE TABLE "place_post_saves" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_post_saves_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "place_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "place_category" NOT NULL,
	"location" geometry(point) NOT NULL,
	"address" text,
	"amenities" "place_amenity"[] DEFAULT '{}' NOT NULL,
	"body" text,
	"status" "place_post_status" DEFAULT 'pending' NOT NULL,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_posts_name_length" CHECK (char_length("place_posts"."name") between 2 and 80),
	CONSTRAINT "place_posts_body_length" CHECK ("place_posts"."body" is null or char_length("place_posts"."body") <= 1000),
	CONSTRAINT "place_posts_address_length" CHECK ("place_posts"."address" is null or char_length("place_posts"."address") <= 200),
	CONSTRAINT "place_posts_in_estonia" CHECK (ST_X("place_posts"."location") between 21.5 and 28.5 and ST_Y("place_posts"."location") between 57.3 and 59.95),
	CONSTRAINT "place_posts_moderated" CHECK (("place_posts"."status" = 'pending') = ("place_posts"."moderated_at" is null))
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"offer_type" "redemption_offer_type" NOT NULL,
	"provider_id" uuid NOT NULL,
	"product_id" uuid,
	"discount_percent" integer NOT NULL,
	"points_cost" integer NOT NULL,
	"code" text NOT NULL,
	"status" "redemption_status" DEFAULT 'active' NOT NULL,
	"idempotency_key" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemptions_code_unique" UNIQUE("code"),
	CONSTRAINT "redemptions_discount_range" CHECK ("redemptions"."discount_percent" between 1 and 15),
	CONSTRAINT "redemptions_cost_positive" CHECK ("redemptions"."points_cost" > 0),
	CONSTRAINT "redemptions_product" CHECK ("redemptions"."offer_type" = 'product' or "redemptions"."product_id" is null),
	CONSTRAINT "redemptions_used_at" CHECK (("redemptions"."status" = 'used') = ("redemptions"."used_at" is not null)),
	CONSTRAINT "redemptions_cancelled_at" CHECK (("redemptions"."status" = 'cancelled') = ("redemptions"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"invitee_id" text PRIMARY KEY NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_not_self" CHECK ("referrals"."invitee_id" <> "referrals"."inviter_id")
);
--> statement-breakpoint
CREATE TABLE "reward_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_earned" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_balances_nonnegative" CHECK ("reward_balances"."balance" >= 0),
	CONSTRAINT "reward_balances_earned_nonnegative" CHECK ("reward_balances"."lifetime_earned" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reward_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" "reward_reason" NOT NULL,
	"source_id" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_ledger_delta_nonzero" CHECK ("reward_ledger"."delta" <> 0),
	CONSTRAINT "reward_ledger_source_length" CHECK (char_length("reward_ledger"."source_id") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "reward_milestones" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_milestones_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key"),
	CONSTRAINT "reward_milestones_kind" CHECK ("reward_milestones"."kind" in ('level', 'badge'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "redemption_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discounted_price_cents" integer;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "rewards" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "service_providers" ADD COLUMN "paw_discount_percent" integer;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_provider_id_service_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_likes" ADD CONSTRAINT "place_post_likes_post_id_place_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."place_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_likes" ADD CONSTRAINT "place_post_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_photos" ADD CONSTRAINT "place_post_photos_post_id_place_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."place_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_reports" ADD CONSTRAINT "place_post_reports_post_id_place_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."place_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_reports" ADD CONSTRAINT "place_post_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_saves" ADD CONSTRAINT "place_post_saves_post_id_place_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."place_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_post_saves" ADD CONSTRAINT "place_post_saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_posts" ADD CONSTRAINT "place_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_provider_id_service_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_product_id_partner_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."partner_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_balances" ADD CONSTRAINT "reward_balances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_milestones" ADD CONSTRAINT "reward_milestones_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_products_provider_idx" ON "partner_products" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "partner_products_category_idx" ON "partner_products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "place_post_likes_user_idx" ON "place_post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "place_post_photos_position_uq" ON "place_post_photos" USING btree ("post_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "place_post_reports_once_uq" ON "place_post_reports" USING btree ("post_id","reporter_id");--> statement-breakpoint
CREATE INDEX "place_post_saves_user_time_idx" ON "place_post_saves" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "place_posts_location_gist" ON "place_posts" USING gist ("location");--> statement-breakpoint
CREATE INDEX "place_posts_status_created_idx" ON "place_posts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "place_posts_author_idx" ON "place_posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "redemptions_user_time_idx" ON "redemptions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_idempotency_uq" ON "redemptions" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "referrals_inviter_idx" ON "referrals" USING btree ("inviter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_ledger_event_uq" ON "reward_ledger" USING btree ("user_id","reason","source_id");--> statement-breakpoint
CREATE INDEX "reward_ledger_user_time_idx" ON "reward_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_redemption_id_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_redemption_uq" ON "bookings" USING btree ("redemption_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount" CHECK (("bookings"."discount_percent" is null) = ("bookings"."discounted_price_cents" is null));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_range" CHECK ("bookings"."discount_percent" is null or "bookings"."discount_percent" between 1 and 15);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" in ('friend_request', 'friend_accepted', 'message', 'friend_plan', 'booking_confirmed', 'booking_cancelled', 'booking_reminder', 'reward_level_up', 'reward_badge', 'place_post_approved'));--> statement-breakpoint
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_paw_discount" CHECK ("service_providers"."paw_discount_percent" is null or "service_providers"."paw_discount_percent" between 1 and 15);--> statement-breakpoint
-- Hand-written (drizzle cannot express triggers): the Käpad ledger is append-only. Corrections are
-- new entries (e.g. redemption_refund), never edits, so the history always explains the balance.
-- DELETE is only allowed as part of a cascade (account deletion): the foreign key's cascade runs
-- inside a referential-integrity trigger, so pg_trigger_depth() is > 1 there and exactly 1 for a
-- direct DELETE statement.
CREATE FUNCTION reward_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reward_ledger is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER reward_ledger_append_only BEFORE UPDATE OR DELETE ON "reward_ledger"
  FOR EACH ROW EXECUTE FUNCTION reward_ledger_append_only();