// Administração de planos e limites. Alterar limites NUNCA apaga dados de clientes: contas acima do
// novo limite apenas deixam de poder criar mais (lojas, usuários, exportações...) até ajustar.
import { asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../../db";
import { AppError, notFound } from "../../errors";
import { writeAdminAudit } from "./audit";

/** Recursos conhecidos (marcadores em plans.limits.features). */
export const PLAN_FEATURES: Array<{ value: string; label: string }> = [
  { value: "vitrine", label: "Vitrine on-line" },
  { value: "exportacao", label: "Exportação de arquivos" },
  { value: "agendamento", label: "Publicação agendada" },
  { value: "filiais", label: "Filiais (várias lojas)" },
  { value: "aprovacao_multipla", label: "Aprovação com vários aprovadores" },
  { value: "video", label: "Vídeos" },
  { value: "ia", label: "Recursos de IA" },
];

// Tetos de sanidade (evitam valores absurdos por erro de digitação).
export const PLAN_MAX = { stores: 1000, users: 5000, storageMb: 1_048_576, exportsPerMonth: 1_000_000, videoMinutesPerMonth: 100_000, aiCreditsPerMonth: 10_000_000, priceCents: 100_000_000 } as const;

const int = (max: number, label: string) => z.number({ error: `${label}: informe um número.` }).int(`${label}: use um número inteiro.`)
  .min(0, `${label} não pode ser negativo.`).max(max, `${label}: valor acima do permitido (${max.toLocaleString("pt-BR")}).`);

export const planLimitsSchema = z.object({
  stores: int(PLAN_MAX.stores, "Lojas").min(1, "O plano precisa permitir ao menos 1 loja."),
  users: int(PLAN_MAX.users, "Usuários").min(1, "O plano precisa permitir ao menos 1 usuário."),
  storageMb: int(PLAN_MAX.storageMb, "Armazenamento (MB)"),
  exportsPerMonth: int(PLAN_MAX.exportsPerMonth, "Exportações por mês"),
  videoMinutesPerMonth: int(PLAN_MAX.videoMinutesPerMonth, "Minutos de vídeo por mês"),
  aiCreditsPerMonth: int(PLAN_MAX.aiCreditsPerMonth, "Créditos de IA por mês"),
  features: z.array(z.string().trim().regex(/^[a-z0-9_]{2,40}$/, "Recurso inválido (use letras minúsculas, números e _).")).max(30).transform((f) => [...new Set(f)]),
}).strict();

const planFields = {
  name: z.string().trim().min(2, "Nome muito curto.").max(40, "Nome muito longo."),
  limits: planLimitsSchema,
  /** centavos inteiros; null = valor a definir */
  priceCents: int(PLAN_MAX.priceCents, "Preço").nullable(),
  providerPriceId: z.string().trim().max(120).regex(/^[A-Za-z0-9_\-.:]*$/, "Id de preço inválido.").nullable().transform((v) => (v ? v : null)),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(-1000).max(1000),
};
export const planUpdateSchema = z.object(planFields).partial().strict();
export const planCreateSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,30}$/, "Identificador: letras minúsculas, números e hífen (2 a 31)."),
  ...planFields,
  priceCents: planFields.priceCents.optional().default(null),
  providerPriceId: planFields.providerPriceId.optional().default(null),
  isActive: planFields.isActive.optional().default(true),
  sortOrder: planFields.sortOrder.optional().default(0),
}).strict();

export async function listPlansAdmin() {
  const db = getDb();
  const plans = await db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder), asc(schema.plans.createdAt));
  const usage = await db.select({ planId: schema.organizations.planId, n: count() }).from(schema.organizations)
    .where(isNull(schema.organizations.deletedAt)).groupBy(schema.organizations.planId);
  const byPlan = new Map(usage.map((u) => [u.planId, u.n]));
  return { plans: plans.map((p) => ({ ...p, orgCount: byPlan.get(p.id) ?? 0 })), features: PLAN_FEATURES, max: PLAN_MAX };
}

export async function updatePlan(adminUserId: string, planId: string, raw: unknown) {
  const input = planUpdateSchema.parse(raw);
  if (!Object.keys(input).length) throw new AppError("validation", "Nada para alterar.");
  return getDb().transaction(async (tx) => {
    const [cur] = await tx.select().from(schema.plans).where(eq(schema.plans.id, planId)).for("update");
    if (!cur) throw notFound("Plano");
    const [row] = await tx.update(schema.plans).set(input).where(eq(schema.plans.id, planId)).returning();
    const changed = Object.keys(input).filter((k) => JSON.stringify((cur as Record<string, unknown>)[k]) !== JSON.stringify((input as Record<string, unknown>)[k]));
    await writeAdminAudit(tx, {
      adminUserId, action: "plan.update", targetType: "plan", targetId: planId,
      details: { changed, before: pick(cur, changed), after: pick(row!, changed) },
    });
    return row!;
  });
}

export async function createPlan(adminUserId: string, raw: unknown) {
  const input = planCreateSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    const [exists] = await tx.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.id, input.id));
    if (exists) throw new AppError("conflict", "Já existe um plano com esse identificador.");
    const [row] = await tx.insert(schema.plans).values(input).returning();
    await writeAdminAudit(tx, { adminUserId, action: "plan.create", targetType: "plan", targetId: input.id, details: { after: input } });
    return row!;
  });
}

function pick(o: object, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]));
}
