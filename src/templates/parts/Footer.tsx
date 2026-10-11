// Rodapé compartilhado: validade (em destaque), endereço, telefone/WhatsApp, horário, redes
// e o texto legal informado pela loja (campaign.legalText). Nenhuma frase legal é inventada aqui.
import type { ReactElement } from "react";
import { fontStack, metricsOf } from "./metrics";
import { clamp, fitOneLine, round } from "./text";
import { ensureContrast } from "./color";
import { AtGlyph, CalendarGlyph, ChatGlyph, ClockGlyph, GlobeGlyph, PhoneGlyph, PinGlyph } from "./glyphs";
import { safeInner } from "./Header";
import type { RenderCtx } from "./types";

type Contact = { key: string; text: string; Icon: (p: { size: number; color: string }) => ReactElement };

export function contactsOf(ctx: RenderCtx): Contact[] {
  const b = ctx.campaign.brand;
  const list: Contact[] = [];
  if (b.address) list.push({ key: "addr", text: b.address, Icon: PinGlyph });
  if (b.phone) list.push({ key: "tel", text: b.phone, Icon: PhoneGlyph });
  if (b.whatsapp) list.push({ key: "wa", text: `WhatsApp ${b.whatsapp}`, Icon: ChatGlyph });
  if (b.hours) list.push({ key: "hr", text: b.hours, Icon: ClockGlyph });
  if (b.instagram) list.push({ key: "ig", text: b.instagram.startsWith("@") ? b.instagram : `@${b.instagram}`, Icon: AtGlyph });
  if (b.website) list.push({ key: "web", text: b.website.replace(/^https?:\/\//, ""), Icon: GlobeGlyph });
  return list;
}

export function Footer({ ctx, decor }: { ctx: RenderCtx; decor?: ReactElement | null }) {
  const { page, skin, campaign } = ctx;
  const r = page.footer;
  if (r.h <= 0 || r.w <= 0) return null;
  const fs = skin.footer;
  const padY = round(clamp(r.h * 0.1, 3, 30));
  const padX = round(clamp(r.w * 0.03, 8, 64));
  const inner = safeInner(r, ctx, padX, padY);
  const bg = fs.bg === "transparent" || fs.style === "plain" ? ctx.colors.background : fs.bg;
  const fg = ensureContrast(fs.fg, bg, 4.5);
  const bf = skin.fonts.body.family;
  const m = metricsOf(bf);
  const contacts = contactsOf(ctx);
  const legal = campaign.legalText?.trim() || null;

  // Tamanhos: validade (1 linha, destaque) · contatos (1 ou 2 linhas) · texto legal (1 ou 2 linhas).
  const W = inner.w * 0.97;
  const contactText = contacts.map((c) => c.text).join("   ");
  const cLen = contactText.length + contacts.length * 3; // ícone + espaço
  const fsFor = (len: number, lines: number) => (len ? W * lines / (len * m.avg * 1.14) : 0);
  let best = { val: 0, c: 0, cl: 1, l: 0, ll: 1, score: -1 };
  for (const cl of contacts.length ? [1, 2] : [0]) {
    for (const ll of legal ? [1, 2] : [0]) {
      let val = Math.min(inner.h * 0.4, fitOneLine(campaign.validityText, W - inner.h * 0.3, inner.h, { family: bf, minFs: 6 }));
      let c = cl ? Math.min(val * 0.88, fsFor(cLen, cl)) : 0;
      let l = ll ? Math.min((c || val) * 0.92, fsFor(legal!.length, ll)) : 0;
      const total = val * 1.2 + cl * c * 1.25 + ll * l * 1.2 + (cl + ll) * val * 0.15;
      if (total > inner.h) { const k = inner.h / total; val *= k; c *= k; l *= k; }
      // prioriza a legibilidade do menor texto, depois o tamanho da validade
      const score = Math.min(val * 0.75, c || val, (l || val) * 1.15) * 3 + val;
      if (score > best.score) best = { val, c, cl, l, ll, score };
    }
  }
  const valFs = round(Math.max(6, best.val));
  const cFs = round(Math.max(6, best.c));
  const legalFs = round(Math.max(6, best.l));
  const cLines = best.cl;
  const lLines = best.ll;
  const accentFg = ensureContrast(fs.accent, bg, 3);

  return (
    <footer data-ev-footer="" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {fs.style !== "plain" && <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, background: bg, borderRadius: fs.style === "card" ? Math.min(r.h * 0.18, 24) : 0 }} />}
      {decor}
      <div style={{ position: "absolute", left: round(inner.x), top: round(inner.y), width: round(inner.w), height: round(inner.h), display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: round(valFs * 0.15), color: fg, fontFamily: fontStack(bf), overflow: "hidden", textAlign: "center" }}>
        <div data-ev-validity="" style={{ display: "flex", alignItems: "center", gap: round(valFs * 0.35), fontSize: valFs, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap", maxWidth: "100%" }}>
          <CalendarGlyph size={round(valFs * 1.05)} color={accentFg} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{campaign.validityText}</span>
        </div>
        {contacts.length > 0 && (
          <div style={{ display: "flex", flexWrap: cLines > 1 ? "wrap" : "nowrap", justifyContent: "center", columnGap: round(cFs * 1.1), rowGap: round(cFs * 0.2), fontSize: cFs, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap", maxWidth: "100%", maxHeight: round(cLines * cFs * 1.45), overflow: "hidden" }}>
            {contacts.map((c) => (
              <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: round(cFs * 0.3) }}>
                <c.Icon size={round(cFs * 1.05)} color={accentFg} />
                {c.text}
              </span>
            ))}
          </div>
        )}
        {legal && (
          <div data-ev-legal="" style={{ fontSize: legalFs, lineHeight: 1.2, opacity: 0.92, maxWidth: "100%", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: lLines, WebkitBoxOrient: "vertical" }}>{legal}</div>
        )}
      </div>
    </footer>
  );
}
