ALTER TABLE "squads" ADD COLUMN "parent_squad_id" uuid;--> statement-breakpoint
ALTER TABLE "squads" ADD COLUMN "echelon" text DEFAULT 'groupe' NOT NULL;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_parent_squad_id_squads_id_fk" FOREIGN KEY ("parent_squad_id") REFERENCES "public"."squads"("id") ON DELETE no action ON UPDATE no action;