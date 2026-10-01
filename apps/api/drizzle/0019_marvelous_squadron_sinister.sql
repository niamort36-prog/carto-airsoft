ALTER TABLE "perk_definitions" ADD COLUMN "orbit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "perk_definitions" ADD COLUMN "sweep_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "perk_definitions" ADD COLUMN "concealment" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "perk_definitions" ADD COLUMN "concealed_covers" text[] DEFAULT '{}' NOT NULL;