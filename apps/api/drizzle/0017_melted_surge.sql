-- Code court des invitations.
--
-- Ajouté en trois temps, et non en un seul `ADD COLUMN ... NOT NULL` : la
-- colonne est obligatoire, or les invitations déjà en base n'en ont pas.
-- On les dote d'un code de rattrapage, visiblement ancien, avant de poser
-- la contrainte.
ALTER TABLE "invite_tokens" ADD COLUMN "code" text;--> statement-breakpoint

WITH numerotees AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM "invite_tokens"
  WHERE "code" IS NULL
)
UPDATE "invite_tokens" t
SET "code" = 'L' || lpad(numerotees.n::text, 7, '0')
FROM numerotees
WHERE t.id = numerotees.id;--> statement-breakpoint

ALTER TABLE "invite_tokens" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_code_unique" UNIQUE("code");
