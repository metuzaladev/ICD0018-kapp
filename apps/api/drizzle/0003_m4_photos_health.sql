DROP INDEX "dog_photos_dog_idx";--> statement-breakpoint
ALTER TABLE "dog_photos" ADD COLUMN "thumbnail_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "dogs" ADD COLUMN "profile_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_profile_photo_id_dog_photos_id_fk" FOREIGN KEY ("profile_photo_id") REFERENCES "public"."dog_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dog_photos_dog_created_idx" ON "dog_photos" USING btree ("dog_id","created_at");--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_next_due_after_date" CHECK ("health_records"."next_due" is null or "health_records"."next_due" > "health_records"."date");