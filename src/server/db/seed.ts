// Seed: planos, calendário comercial global (2026 e 2027) e conta de DEMONSTRAÇÃO.
// Uso: npm run db:seed  (DATABASE_URL obrigatório). A senha da conta demo é gerada a cada execução
// e exibida apenas no terminal — não é gravada em nenhum outro lugar.
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { getDb, getPool, schema } from "./index";
import { ensurePlans } from "../services/plans";
import { commercialCalendar } from "../calendar";
import { newId } from "../ids";
import { randomToken } from "../signing";
import { hashPassword } from "../auth/password";
import { insertBrandKit } from "../services/brand-kits";
import { insertStore, storeInputSchema } from "../services/stores";
import { createCampaign } from "../services/campaigns";
import { transitionCampaign } from "../services/campaign-workflow";
import { normalizeName } from "../text";
import type { TenantCtx } from "../context";

export const DEMO_EMAIL = "demo@exemplo.com";
export const DEMO_ORG_NAME = "Mercado Exemplo (dados de demonstração)";

// Produtos genéricos e fictícios (sem marcas reais). Preços de DEMONSTRAÇÃO, sem relação com mercado real.
// [nome, categoria, tamanho, unidade, preço normal, preço oferta]
const DEMO_PRODUCTS: Array<[string, string, string | null, string, number, number | null]> = [
  ["Arroz tipo 1 5kg", "Mercearia", "5kg", "pct", 2990, 2490],
  ["Feijão carioca 1kg", "Mercearia", "1kg", "pct", 899, 749],
  ["Feijão preto 1kg", "Mercearia", "1kg", "pct", 949, null],
  ["Açúcar refinado 1kg", "Mercearia", "1kg", "pct", 549, 469],
  ["Café torrado e moído 500g", "Mercearia", "500g", "pct", 2290, 1990],
  ["Óleo de soja 900ml", "Mercearia", "900ml", "garrafa", 899, 749],
  ["Macarrão espaguete 500g", "Mercearia", "500g", "pct", 499, 399],
  ["Farinha de trigo 1kg", "Mercearia", "1kg", "pct", 599, null],
  ["Sal refinado 1kg", "Mercearia", "1kg", "pct", 299, null],
  ["Molho de tomate 340g", "Mercearia", "340g", "un", 349, 279],
  ["Leite integral 1L", "Laticínios", "1L", "cx", 549, 479],
  ["Iogurte natural 170g", "Laticínios", "170g", "un", 329, null],
  ["Queijo muçarela fatiado", "Frios", null, "kg", 5990, 4990],
  ["Presunto cozido fatiado", "Frios", null, "kg", 3990, 3490],
  ["Manteiga com sal 200g", "Laticínios", "200g", "un", 1290, 1090],
  ["Margarina 500g", "Laticínios", "500g", "un", 899, null],
  ["Ovos brancos", "Hortifrúti", "12 unidades", "dz", 1290, 1090],
  ["Banana prata", "Hortifrúti", null, "kg", 699, 549],
  ["Maçã gala", "Hortifrúti", null, "kg", 1099, 899],
  ["Tomate", "Hortifrúti", null, "kg", 899, 699],
  ["Batata", "Hortifrúti", null, "kg", 649, 499],
  ["Cebola", "Hortifrúti", null, "kg", 599, null],
  ["Alface crespa", "Hortifrúti", null, "un", 349, 299],
  ["Laranja pera", "Hortifrúti", null, "kg", 499, 399],
  ["Carne moída", "Açougue", null, "kg", 3490, 2990],
  ["Contrafilé bovino", "Açougue", null, "kg", 5990, 4990],
  ["Coxa e sobrecoxa de frango", "Açougue", null, "kg", 1590, 1290],
  ["Peito de frango", "Açougue", null, "kg", 2190, 1890],
  ["Linguiça toscana", "Açougue", null, "kg", 2490, 1990],
  ["Pão francês", "Padaria", null, "kg", 1590, 1390],
  ["Pão de forma 500g", "Padaria", "500g", "pct", 899, null],
  ["Bolo de fubá", "Padaria", "400g", "un", 1290, 990],
  ["Refrigerante cola 2L", "Bebidas", "2L", "garrafa", 999, 849],
  ["Suco de laranja 1L", "Bebidas", "1L", "cx", 899, null],
  ["Água mineral sem gás 1,5L", "Bebidas", "1,5L", "garrafa", 349, 279],
  ["Cerveja pilsen lata 350ml", "Bebidas", "350ml", "lata", 449, 379],
  ["Detergente líquido 500ml", "Limpeza", "500ml", "un", 299, 239],
  ["Sabão em pó 1kg", "Limpeza", "1kg", "cx", 1690, 1390],
  ["Água sanitária 2L", "Limpeza", "2L", "un", 699, null],
  ["Amaciante 2L", "Limpeza", "2L", "un", 1490, 1190],
  ["Papel higiênico folha dupla 12 rolos", "Higiene", "12 rolos", "pct", 2290, 1890],
  ["Sabonete 85g", "Higiene", "85g", "un", 249, 199],
  ["Creme dental 90g", "Higiene", "90g", "un", 549, 449],
  ["Xampu 350ml", "Higiene", "350ml", "un", 1590, null],
  ["Biscoito recheado 130g", "Mercearia", "130g", "pct", 349, 279],
];

async function seedCalendar() {
  const db = getDb();
  for (const year of [2026, 2027]) {
    await db.delete(schema.calendarEvents).where(and(isNull(schema.calendarEvents.orgId), like(schema.calendarEvents.date, `${year}-%`)));
    const events = commercialCalendar(year);
    await db.insert(schema.calendarEvents).values(events.map((e) => ({ id: newId("cal"), orgId: null, name: e.name, date: e.date, isMovable: e.isMovable, note: e.note })));
  }
}

async function seedDemo(): Promise<string> {
  const db = getDb();
  const password = randomToken(9); // ~12 caracteres
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${DEMO_EMAIL}`);
  if (existing) {
    await db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, existing.id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, existing.id));
    return password;
  }
  const userId = newId("usr");
  const orgId = newId("org");
  const ctx: TenantCtx = { userId, orgId, role: "admin", storeIds: null, isPlatformAdmin: false };
  const { storeId, productIds } = await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({ id: userId, email: DEMO_EMAIL, name: "Usuário de demonstração", passwordHash, emailVerifiedAt: new Date() });
    await tx.insert(schema.organizations).values({ id: orgId, name: DEMO_ORG_NAME, planId: "profissional", isDemo: true });
    const bk = await insertBrandKit(orgId, "Mercado Exemplo", tx);
    await tx.update(schema.brandKits).set({ slogan: "Dados de demonstração", legalText: "DADOS DE DEMONSTRAÇÃO. Preços e produtos fictícios." }).where(eq(schema.brandKits.id, bk.id));
    const s1 = await insertStore(orgId, storeInputSchema.parse({
      name: "Mercado Exemplo Centro", slug: "mercado-exemplo-demo", brandKitId: bk.id,
      hours: { "0": "07:00-13:00", "1": "07:00-21:00", "2": "07:00-21:00", "3": "07:00-21:00", "4": "07:00-21:00", "5": "07:00-21:00", "6": "07:00-21:00" },
      hoursNote: "Dados de demonstração",
    }), tx);
    await insertStore(orgId, storeInputSchema.parse({ name: "Mercado Exemplo Bairro", slug: "mercado-exemplo-demo-bairro", brandKitId: bk.id, hoursNote: "Dados de demonstração" }), tx);
    await tx.insert(schema.memberships).values({ orgId, userId, role: "admin" });
    const ids: string[] = [];
    for (const [name, category, sizeLabel, unit, regular, promo] of DEMO_PRODUCTS) {
      const id = newId("prd");
      ids.push(id);
      await tx.insert(schema.products).values({
        id, orgId, name, brand: null, category, sizeLabel, unit, regularCents: regular, promoCents: promo,
        conditions: null, normalizedName: normalizeName(name),
      });
    }
    return { storeId: s1.id, productIds: ids };
  });
  // campanha de exemplo publicada na vitrine da 1ª loja (validade de 7 dias a partir de hoje)
  // 00:00 de hoje no horário de Brasília (UTC-3)
  const brt = new Date(Date.now() - 3 * 3600000);
  const start = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0));
  const end = new Date(start.getTime() + 7 * 86400000 - 1000);
  const state = await createCampaign(ctx, {
    storeId, name: "Ofertas da Semana (demonstração)", startsAt: start.toISOString(), endsAt: end.toISOString(),
    productIds: productIds.filter((_, i) => DEMO_PRODUCTS[i]![5] !== null).slice(0, 12),
  });
  await transitionCampaign(ctx, state.campaign.id, "approve");
  await transitionCampaign(ctx, state.campaign.id, "publish");
  return password;
}

async function main() {
  await ensurePlans();
  await seedCalendar();
  const password = await seedDemo();
  console.log("Seed concluído: planos, calendário 2026/2027 e conta de demonstração.");
  console.log(`Conta demo: ${DEMO_EMAIL} / senha: ${password}  (gerada agora; rode o seed de novo para trocar)`);
  await getPool().end();
}

main().catch(async (e) => { console.error(e); await getPool().end().catch(() => {}); process.exit(1); });
