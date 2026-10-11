// Concede ou remove o acesso à administração da plataforma (/admin). Não existe tela para isso:
// só quem tem acesso ao servidor (e ao DATABASE_URL) pode promover alguém.
//
//   npm run admin:grant -- pessoa@empresa.com    → users.is_platform_admin = true
//   npm run admin:revoke -- pessoa@empresa.com   → users.is_platform_admin = false
//
// O usuário precisa já ter conta (cadastro normal). A mudança vale na próxima requisição (a sessão é
// relida no banco a cada chamada). A ação fica registrada em admin_audit_log (admin_user_id = o próprio usuário,
// detalhes { via: "cli" }). A conta de demonstração do seed NÃO é administradora da plataforma.
import { eq, sql } from "drizzle-orm";
import { getDb, getPool, schema } from "../src/server/db";
import { writeAdminAudit } from "../src/server/services/admin/audit";

async function main() {
  const [mode, email] = process.argv.slice(2).filter((a) => a !== "--");
  if ((mode !== "grant" && mode !== "revoke") || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Uso: npm run admin:grant -- <email>   |   npm run admin:revoke -- <email>");
    process.exitCode = 1;
    return;
  }
  const db = getDb();
  const [user] = await db.select({ id: schema.users.id, name: schema.users.name, isPlatformAdmin: schema.users.isPlatformAdmin, deletedAt: schema.users.deletedAt })
    .from(schema.users).where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()));
  if (!user || user.deletedAt) {
    console.error(`Nenhum usuário ativo com o e-mail ${email}. Faça o cadastro primeiro.`);
    process.exitCode = 1;
    return;
  }
  const value = mode === "grant";
  if (user.isPlatformAdmin === value) {
    console.log(value ? `${email} já é administrador da plataforma.` : `${email} não é administrador da plataforma.`);
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ isPlatformAdmin: value, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
    await writeAdminAudit(tx, { adminUserId: user.id, action: value ? "user.grant_admin" : "user.revoke_admin", targetType: "user", targetId: user.id, details: { via: "cli", email } });
  });
  console.log(value ? `Pronto: ${email} agora acessa /admin.` : `Pronto: ${email} não acessa mais /admin.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => getPool().end());
