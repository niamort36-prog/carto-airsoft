CREATE TABLE "perk_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"type" text NOT NULL,
	"radius_meters" integer DEFAULT 300 NOT NULL,
	"duration_seconds" integer DEFAULT 30 NOT NULL,
	"cooldown_seconds" integer DEFAULT 300 NOT NULL,
	"stock_per_team" integer,
	"allowed_roles" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perk_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"caster_membership_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"target" geometry(point) NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"jammed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "perk_definitions" ADD CONSTRAINT "perk_definitions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perk_instances" ADD CONSTRAINT "perk_instances_definition_id_perk_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."perk_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perk_instances" ADD CONSTRAINT "perk_instances_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perk_instances" ADD CONSTRAINT "perk_instances_caster_membership_id_memberships_id_fk" FOREIGN KEY ("caster_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perk_instances" ADD CONSTRAINT "perk_instances_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perk_instances_game_idx" ON "perk_instances" USING btree ("game_id","ends_at");