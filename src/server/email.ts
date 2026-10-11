import { customAlphabet } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { getDb, schema } from "./db";
import type { Executor } from "./db/tx";

// E-mail transacional com caixa de saída no banco (email_outbox).
// - Sem SMTP_URL: a mensagem fica só na caixa de saída (status "armazenado") e aparece em GET /api/dev/emails
//   (somente fora de produção).
// - Com SMTP_URL (ex.: smtps://usuario:senha@smtp.exemplo.com:465): a mensagem é registrada e enviada por
//   nodemailer em segundo plano, depois que o registro estiver confirmado no banco (se a transação que pediu o
//   envio for desfeita, nada é enviado). O status vira "enviado" (com sent_at) ou "falhou".
//   O envio não é aguardado pela requisição: a resposta de "Esqueci minha senha" leva o mesmo tempo com ou sem conta.
// Nunca registrar no log o conteúdo, o assunto ou o destinatário (links com token).

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: string;
  orgId?: string | null;
}

/** Interface mínima de transporte (compatível com nodemailer.Transporter). */
export interface EmailTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string; html?: string }): Promise<unknown>;
}

let transport: EmailTransport | null = null;
let transportKey: string | null = null;
let transportOverride: EmailTransport | null = null;

/** Somente para testes: substitui o transporte SMTP (null volta ao padrão). */
export function setEmailTransportForTests(t: EmailTransport | null) { transportOverride = t; }

function getTransport(): EmailTransport | null {
  if (transportOverride) return transportOverride;
  const url = process.env.SMTP_URL?.trim();
  if (!url) return null;
  if (!transport || transportKey !== url) {
    transport = nodemailer.createTransport(url);
    transportKey = url;
  }
  return transport;
}

const emailFrom = () => process.env.EMAIL_FROM?.trim() || "EncarteVarejo <nao-responda@localhost>";

const pending = new Set<Promise<void>>();
/** Aguarda os envios em andamento (testes e encerramento do processo). */
export async function flushEmailDeliveries() {
  while (pending.size) await Promise.allSettled([...pending]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera o registro ficar visível (transação confirmada), envia e grava o resultado. Nunca lança. */
async function deliver(id: string, msg: OutgoingEmail, t: EmailTransport) {
  const db = getDb();
  try {
    let row: { status: string } | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      [row] = await db.select({ status: schema.emailOutbox.status }).from(schema.emailOutbox).where(eq(schema.emailOutbox.id, id));
      if (row) break;
      await sleep(Math.min(50 * 2 ** attempt, 1000));
    }
    if (!row || row.status !== "armazenado") return; // transação desfeita (ou já tratado): não envia
    try {
      await t.sendMail({ from: emailFrom(), to: msg.to.trim(), subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) });
      await db.update(schema.emailOutbox).set({ status: "enviado", sentAt: new Date() })
        .where(and(eq(schema.emailOutbox.id, id), eq(schema.emailOutbox.status, "armazenado")));
    } catch (e) {
      const err = e as { code?: unknown; responseCode?: unknown };
      // só códigos técnicos: a mensagem do erro pode ecoar conteúdo
      console.error(`[email] falha ao enviar ${id} (${msg.kind}): código ${String(err?.code ?? "desconhecido")}${err?.responseCode ? ` / SMTP ${String(err.responseCode)}` : ""}`);
      await db.update(schema.emailOutbox).set({ status: "falhou" })
        .where(and(eq(schema.emailOutbox.id, id), eq(schema.emailOutbox.status, "armazenado")));
    }
  } catch {
    console.error(`[email] erro ao registrar o envio de ${id} (${msg.kind}).`);
  }
}

export async function sendEmail(msg: OutgoingEmail, db: Executor = getDb()): Promise<string> {
  const id = `eml_${nano()}`;
  await db.insert(schema.emailOutbox).values({
    id, orgId: msg.orgId ?? null, toEmail: msg.to.trim().toLowerCase(), subject: msg.subject,
    textBody: msg.text, htmlBody: msg.html ?? null, kind: msg.kind, status: "armazenado",
  });
  const t = getTransport();
  if (t) {
    const p = deliver(id, msg, t).finally(() => pending.delete(p));
    pending.add(p);
  }
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
