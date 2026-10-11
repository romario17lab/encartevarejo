-- Etapa 5: novos recursos nos planos padrão (só acrescenta; não remove nada que a administração tenha mudado)
UPDATE "plans" SET "limits" = jsonb_set("limits", '{features}', ("limits"->'features') || '["tv"]'::jsonb)
  WHERE "id" IN ('profissional', 'redes') AND NOT (("limits"->'features') ? 'tv');
--> statement-breakpoint
UPDATE "plans" SET "limits" = jsonb_set("limits", '{features}', ("limits"->'features') || '["agencia"]'::jsonb)
  WHERE "id" = 'redes' AND NOT (("limits"->'features') ? 'agencia');
