ALTER TABLE "memberships" ALTER COLUMN "role" SET DEFAULT 'joueur';--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "unit_type" text DEFAULT 'infantry' NOT NULL;--> statement-breakpoint
UPDATE "memberships" SET "role" = 'commandant' WHERE "role" = 'orga';--> statement-breakpoint
UPDATE "memberships" SET "role" = 'joueur' WHERE "role" = 'player';--> statement-breakpoint
UPDATE "memberships" SET "unit_type" = 'command' WHERE "role" = 'commandant';