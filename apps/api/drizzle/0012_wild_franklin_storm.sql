CREATE TABLE "map_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"feature_count" integer DEFAULT 0 NOT NULL,
	"imported_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "map_layers" ADD CONSTRAINT "map_layers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_layers" ADD CONSTRAINT "map_layers_imported_by_membership_id_memberships_id_fk" FOREIGN KEY ("imported_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_layers_game_idx" ON "map_layers" USING btree ("game_id");