// D-04: com SMTP_URL definido o e-mail é enviado (nodemailer) e o resultado fica na caixa de saída.
import { afterEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { flushEmailDeliveries, sendEmail, setEmailTransportForTests, type EmailTransport } from "@/server/email";
import { forgotPassword } from "@/server/services/auth";
import { makeOrg, uid } from "./helpers";

const row = async (id: string) => (await getDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, id)))[0]!;
const TOKEN_TEXT = "Use o link http://localhost/redefinir-senha?token=SEGREDO-NAO-LOGAR-123";

afterEach(() => {
  setEmailTransportForTests(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("e-mail (D-04)", () => {
  it("sem SMTP_URL fica só na caixa de saída", async () => {
    vi.stubEnv("SMTP_URL", "");
    const id = await sendEmail({ to: `a-${uid()}@teste.com`, subject: "Assunto", text: "Corpo", kind: "teste" });
    await flushEmailDeliveries();
    const r = await row(id);
    expect(r.status).toBe("armazenado");
    expect(r.sentAt).toBeNull();
  });

  it("com transporte configurado envia e marca como enviado", async () => {
    const sendMail = vi.fn<EmailTransport["sendMail"]>(async () => ({ messageId: "x" }));
    setEmailTransportForTests({ sendMail });
    vi.stubEnv("EMAIL_FROM", "Mercado <nao-responda@exemplo.com>");
    const to = `B-${uid()}@Teste.com`;
    const id = await sendEmail({ to, subject: "Crie uma nova senha", text: TOKEN_TEXT, html: "<p>oi</p>", kind: "password_reset" });
    await flushEmailDeliveries();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ from: "Mercado <nao-responda@exemplo.com>", to, subject: "Crie uma nova senha", text: TOKEN_TEXT, html: "<p>oi</p>" });
    const r = await row(id);
    expect(r.status).toBe("enviado");
    expect(r.sentAt).toBeInstanceOf(Date);
  });

  it("falha no SMTP marca falhou e não registra o conteúdo no log", async () => {
    const err = Object.assign(new Error(`550 rejeitado: ${TOKEN_TEXT}`), { code: "EENVELOPE", responseCode: 550 });
    setEmailTransportForTests({ sendMail: async () => { throw err; } });
    const logs: string[] = [];
    for (const m of ["error", "warn", "log", "info"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
    const id = await sendEmail({ to: `c-${uid()}@teste.com`, subject: "Assunto secreto", text: TOKEN_TEXT, kind: "password_reset" });
    await flushEmailDeliveries();
    expect((await row(id)).status).toBe("falhou");
    expect(logs.join("\n")).toContain("EENVELOPE");
    expect(logs.join("\n")).not.toMatch(/SEGREDO|token=|Assunto secreto|@teste\.com/);
  });

  it("transação desfeita não envia nada", async () => {
    const sendMail = vi.fn<EmailTransport["sendMail"]>(async () => ({}));
    setEmailTransportForTests({ sendMail });
    let id = "";
    await expect(getDb().transaction(async (tx) => {
      id = await sendEmail({ to: `d-${uid()}@teste.com`, subject: "Convite", text: "x", kind: "invitation" }, tx);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    await flushEmailDeliveries();
    expect(sendMail).not.toHaveBeenCalled();
    expect(await getDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, id))).toHaveLength(0);
  });

  it("SMTP_URL real (servidor SMTP local): esqueci minha senha chega ao servidor", async () => {
    const received: string[] = [];
    const server = net.createServer((sock) => {
      let data = false; let buf = "";
      sock.write("220 teste ESMTP\r\n");
      sock.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        let i: number;
        while ((i = buf.indexOf("\r\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (data) {
            if (line === ".") { data = false; sock.write("250 OK enfileirado\r\n"); } else received.push(line);
            continue;
          }
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === "EHLO" || cmd === "HELO") sock.write("250 teste\r\n");
          else if (cmd === "DATA") { data = true; sock.write("354 envie\r\n"); }
          else if (cmd === "QUIT") { sock.write("221 tchau\r\n"); sock.end(); }
          else sock.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as net.AddressInfo).port;
    try {
      vi.stubEnv("SMTP_URL", `smtp://127.0.0.1:${port}?ignoreTLS=true`);
      const org = await makeOrg();
      const r = await forgotPassword({ email: org.email }, { ip: `ip-${uid()}` });
      expect(r.ok).toBe(true);
      await flushEmailDeliveries();
      const [m] = await getDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.toEmail, org.email));
      expect(m!.status).toBe("enviado");
      const raw = received.join("\n");
      expect(raw).toMatch(/redefinir-senha/);
      expect(raw.toLowerCase()).toContain(org.email.toLowerCase());
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
