CREATE TABLE "map_objects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"kind" text DEFAULT 'marker' NOT NULL,
	"marker_type" text DEFAULT 'unit' NOT NULL,
	"position" geometry(point) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" text DEFAULT 'global' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "map_objects" ADD CONSTRAINT "map_objects_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_objects" ADD CONSTRAINT "map_objects_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_objects_game_updated_idx" ON "map_objects" USING btree ("game_id","updated_at");