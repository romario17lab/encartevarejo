import { customAlphabet } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Executor } from "./db/tx";

// E-mail transacional com caixa de saída no banco.
// Sem SMTP_URL, as mensagens ficam em email_outbox e aparecem em GET /api/dev/emails (somente fora de produção).
// Com SMTP_URL, a mensagem também fica registrada na caixa de saída; o envio real exige um adaptador SMTP
// (ex.: nodemailer), que ainda não está instalado — ver relatório do Agente de Backend.

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: string;
  orgId?: string | null;
}

let warned = false;

export async function sendEmail(msg: OutgoingEmail, db: Executor = getDb()): Promise<string> {
  const id = `eml_${nano()}`;
  await db.insert(schema.emailOutbox).values({
    id, orgId: msg.orgId ?? null, toEmail: msg.to.trim().toLowerCase(), subject: msg.subject,
    textBody: msg.text, htmlBody: msg.html ?? null, kind: msg.kind, status: "armazenado",
  });
  if (process.env.SMTP_URL && !warned) {
    warned = true;
    console.warn("[email] SMTP_URL definido, mas o adaptador SMTP não está instalado; mensagens ficam na caixa de saída.");
  }
  // nunca registrar o conteúdo (pode conter links com token)
  return id;
}

export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const devEmailsEnabled = () => process.env.NODE_ENV !== "production";

/** Lista as mensagens da caixa de saída (apenas desenvolvimento/testes). */
export async function listDevEmails(opts: { to?: string | null; limit?: number } = {}) {
  const db = getDb();
  const q = db.select().from(schema.emailOutbox);
  const rows = await (opts.to ? q.where(eq(schema.emailOutbox.toEmail, opts.to.trim().toLowerCase())) : q)
    .orderBy(desc(schema.emailOutbox.createdAt)).limit(Math.min(opts.limit ?? 50, 200));
  return rows.map((r) => ({ id: r.id, to: r.toEmail, subject: r.subject, text: r.textBody, html: r.htmlBody, kind: r.kind, createdAt: r.createdAt }));
}
