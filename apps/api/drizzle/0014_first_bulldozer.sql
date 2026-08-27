ALTER TABLE "memberships" ADD COLUMN "reports_to_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "squads" ADD COLUMN "leader_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "squads" ADD COLUMN "reports_to_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_reports_to_membership_id_memberships_id_fk" FOREIGN KEY ("reports_to_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_leader_membership_id_memberships_id_fk" FOREIGN KEY ("leader_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_reports_to_membership_id_memberships_id_fk" FOREIGN KEY ("reports_to_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;