CREATE TABLE "prepared_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"basemap" text DEFAULT 'plan_ign' NOT NULL,
	"center_lat" double precision,
	"center_lng" double precision,
	"zoom" double precision,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "prepared_map_id" uuid;--> statement-breakpoint
ALTER TABLE "prepared_maps" ADD CONSTRAINT "prepared_maps_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_prepared_map_id_prepared_maps_id_fk" FOREIGN KEY ("prepared_map_id") REFERENCES "public"."prepared_maps"("id") ON DELETE no action ON UPDATE no action;