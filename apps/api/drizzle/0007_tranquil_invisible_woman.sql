ALTER TABLE "chat_channels" ADD COLUMN "required_permission" text;--> statement-breakpoint
-- Migration des canaux existants : le cloisonnement par rang devient une
-- permission (§5). Les canaux « commandement » exigent désormais chat:command.
UPDATE "chat_channels" SET "required_permission" = 'chat:command' WHERE "scope" = 'command';