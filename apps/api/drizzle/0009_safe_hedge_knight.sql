CREATE TABLE "bonus_qrs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"reward" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attachment_url" text,
	"max_scans_total" integer,
	"max_scans_per_player" integer DEFAULT 1,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"carrier_membership_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonus_qrs_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bonus_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bonus_qr_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objective_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objective_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objective_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"from_objective_id" uuid NOT NULL,
	"to_objective_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" geometry(point) NOT NULL,
	"token_hash" text NOT NULL,
	"capture_order" integer,
	"allowed_roles" text[] DEFAULT '{}' NOT NULL,
	"reward" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"holder_team_id" uuid,
	"last_captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objectives_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bonus_qrs" ADD CONSTRAINT "bonus_qrs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_scans" ADD CONSTRAINT "bonus_scans_bonus_qr_id_bonus_qrs_id_fk" FOREIGN KEY ("bonus_qr_id") REFERENCES "public"."bonus_qrs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_scans" ADD CONSTRAINT "bonus_scans_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_captures" ADD CONSTRAINT "objective_captures_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_captures" ADD CONSTRAINT "objective_captures_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_captures" ADD CONSTRAINT "objective_captures_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_links" ADD CONSTRAINT "objective_links_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_links" ADD CONSTRAINT "objective_links_from_objective_id_objectives_id_fk" FOREIGN KEY ("from_objective_id") REFERENCES "public"."objectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_links" ADD CONSTRAINT "objective_links_to_objective_id_objectives_id_fk" FOREIGN KEY ("to_objective_id") REFERENCES "public"."objectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bonus_qrs_game_idx" ON "bonus_qrs" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "objectives_game_idx" ON "objectives" USING btree ("game_id");