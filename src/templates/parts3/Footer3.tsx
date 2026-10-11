// Rodapé completo (v3): faixa com a validade em destaque (selo de calendário), ícones de WhatsApp,
// endereço, horário, entrega, telefone, Instagram e site — tudo do cadastro da loja (o que falta some,
// nada é inventado) — e "Oferta válida enquanto durar o estoque" + texto legal informado pela loja.
import type { ReactElement } from "react";
import type { RenderCampaign } from "@/domain/campaign";
import { ensureContrast } from "../parts/color";
import { AtGlyph, CalendarGlyph, ChatGlyph, ClockGlyph, GlobeGlyph, PhoneGlyph, PinGlyph } from "../parts/glyphs";
import { clamp, fitLines, fontStack, r1, textWidth, type Face } from "../parts2/measure";
import { safeInner2 } from "../parts2/Header2";
import type { Ctx3 } from "./look3";

type G = { size: number; color: string };
/** Caminhão de entrega genérico (SVG próprio). */
export const TruckGlyph = ({ size, color }: G) => (
  <svg viewBox="0 0 24 24" style={{ width: size, height: size, flex: "none", display: "inline-block", verticalAlign: "middle" }} aria-hidden="true"><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7z" fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" /><circle cx="7" cy="17.5" r="2" fill={color} /><circle cx="17" cy="17.5" r="2" fill={color} /></svg>
);

type Contact = { key: string; text: string; Icon: (p: G) => ReactElement };

/** Contatos na ordem do estudo: WhatsApp, endereço, horário, entrega; depois telefone, Instagram e site. */
export function contacts3(c: RenderCampaign): Contact[] {
  const b = c.brand as RenderCampaign["brand"] & { delivery?: string | null };
  const list: Contact[] = [];
  if (b.whatsapp) list.push({ key: "wa", text: `WhatsApp ${b.whatsapp}`, Icon: ChatGlyph });
  if (b.address) list.push({ key: "addr", text: b.address, Icon: PinGlyph });
  if (b.hours) list.push({ key: "hr", text: b.hours, Icon: ClockGlyph });
  // entrega: só aparece se a loja informar (o cadastro atual não tem esse campo; nunca é presumida)
  if (b.delivery) list.push({ key: "dl", text: b.delivery, Icon: TruckGlyph });
  if (b.phone) list.push({ key: "tel", text: b.phone, Icon: PhoneGlyph });
  if (b.instagram) list.push({ key: "ig", text: b.instagram.startsWith("@") ? b.instagram : `@${b.instagram}`, Icon: AtGlyph });
  if (b.website) list.push({ key: "web", text: b.website.replace(/^https?:\/\//, ""), Icon: GlobeGlyph });
  return list;
}

export const STOCK_NOTE = "Oferta válida enquanto durar o estoque";

function pack(list: Contact[], face: Face, fs: number, w: number, lines: number): Contact[][] | null {
  const out: Contact[][] = [[]];
  let cur = 0;
  for (const c of list) {
    const cw = textWidth(c.text, face, fs) + fs * 1.45;
    const gap = out[out.length - 1].length ? fs * 1.1 : 0;
    if (cur + gap + cw <= w) { out[out.length - 1].push(c); cur += gap + cw; continue; }
    if (cw > w || out.length >= lines) return null;
    out.push([c]);
    cur = cw;
  }
  return out;
}

export function Footer3({ ctx }: { ctx: Ctx3 }): ReactElement | null {
  const { page, look, campaign } = ctx;
  const r = page.footer;
  if (r.h <= 0 || r.w <= 0) return null;
  const F = look.footer;
  const inner = safeInner2(r, ctx, r1(clamp(r.w * 0.025, 6, 48)), r1(clamp(r.h * 0.08, 3, 20)));
  const fg = ensureContrast(F.fg, F.bg, 7);
  const chipBg = F.accent;
  const chipFg = ensureContrast(F.accentFg, chipBg, 4.5);
  const icon = ensureContrast(F.accent, F.bg, 3);
  const face: Face = { family: "Inter", weight: 700 };
  const bold: Face = { family: "Inter", weight: 900 };
  const contacts = contacts3(campaign);
  const validity = campaign.validityText.trim();
  const valUp = validity.toLocaleUpperCase("pt-BR");
  const stock = /estoque/i.test(validity) ? null : STOCK_NOTE;
  const legalParts = [stock, campaign.legalText?.trim() || null].filter(Boolean) as string[];
  const legal = legalParts.join(" · ") || null;
  const W = inner.w, H = inner.h;
  const wide = W / H > 7;

  // escolhe tamanhos: validade (selo) > contatos > legal; prefere menos linhas e letras maiores
  let best: { val: number; c: number; cl: Contact[][]; l: number; ll: string[]; score: number; side: boolean } | null = null;
  for (const side of wide ? [true, false] : [false]) {
    const valW = side ? W * 0.36 : W;
    const restW = side ? W - valW - H * 0.2 : W;
    for (const cLines of contacts.length ? [1, 2, 3] : [0]) {
      for (const lLines of legal ? [1, 2] : [0]) {
        let val = Math.max(5.5, Math.min(H * (side ? 0.3 : 0.26), (valW * 0.98) / (textWidth(valUp, bold, 1) + 2.9)));
        let c = side ? H * 0.22 : val * 0.82;
        let cl: Contact[][] = [];
        if (cLines) {
          while (c > 5.5) { const p = pack(contacts, face, c, restW, cLines); if (p) { cl = p; break; } c *= 0.95; }
          if (!cl.length) { c = 5.5; cl = pack(contacts, face, c, restW, 9) ?? [contacts]; }
        }
        let l = 0, ll: string[] = [];
        if (lLines) {
          const f = fitLines(legal!, face, restW, (c || val) * 0.8 * 1.2 * lLines, { maxFs: (c || val) * 0.78, minFs: 5.5, maxLines: lLines, lineHeight: 1.2 });
          l = f.fs; ll = f.truncated ? [...f.lines.slice(0, -1), `${f.lines[f.lines.length - 1]}…`] : f.lines;
        }
        const chipH = val * 1.55;
        const restH = cl.length * c * 1.32 + ll.length * l * 1.2;
        const total = side ? Math.max(chipH, restH + c * 0.1 * cl.length) : chipH + val * 0.25 * (cl.length + (ll.length ? 1 : 0)) + restH;
        const k = Math.min(1, (H * 0.96) / total);
        val *= k; c *= k; l *= k;
        if (k < 1 && lLines) {
          const f = fitLines(legal!, face, restW, l * 1.2 * lLines, { maxFs: l, minFs: 5.5, maxLines: lLines, lineHeight: 1.2 });
          l = f.fs; ll = f.truncated ? [...f.lines.slice(0, -1), `${f.lines[f.lines.length - 1]}…`] : f.lines;
        }
        const score = Math.min(val * 0.8, c || val, (l || val) * 1.25) * 3 + val;
        if (!best || score > best.score) best = { val, c, cl, l, ll, score, side };
      }
    }
  }
  const b = best!;
  const chip = (
    <div data-ev-validity="" style={{ display: "inline-flex", alignItems: "center", gap: r1(b.val * 0.35), background: chipBg, color: chipFg, fontSize: r1(b.val), fontWeight: 900, lineHeight: 1, padding: `${r1(b.val * 0.27)}px ${r1(b.val * 0.6)}px`, borderRadius: r1(b.val * 0.35), boxShadow: `${r1(b.val * 0.14)}px ${r1(b.val * 0.14)}px 0 rgba(0,0,0,.45)`, whiteSpace: "nowrap", maxWidth: "100%" }}>
      <CalendarGlyph size={r1(b.val * 1.1)} color={chipFg} />
      <span>{valUp}</span>
    </div>
  );
  const rest = (
    <>
      {b.cl.map((line, i) => (
        <div key={i} style={{ display: "flex", justifyContent: b.side ? "flex-start" : "center", columnGap: r1(b.c * 1.1), fontSize: r1(b.c), fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap" }}>
          {line.map((c) => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: r1(b.c * 0.3) }}>
              <c.Icon size={r1(b.c * 1.12)} color={icon} />
              {c.text}
            </span>
          ))}
        </div>
      ))}
      {b.ll.length > 0 && (
        <div data-ev-legal="" style={{ fontSize: r1(b.l), fontWeight: 600, lineHeight: 1.2, opacity: 0.92, textAlign: b.side ? "left" : "center" }}>
          {b.ll.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
        </div>
      )}
    </>
  );
  // faixa de fundo em largura total (corte reto, diagonal ou ondulado) + conteúdo na área segura
  const e = r1(clamp(r.h * 0.12, 4, 26));
  const clip = F.edge === "diagonal" ? `polygon(0 ${r1(e)}px, 100% 0, 100% 100%, 0 100%)` : F.edge === "onda" ? `path('M0 ${r1(e)}C${r1(r.w * 0.3)} 0 ${r1(r.w * 0.6)} ${r1(e * 1.6)} ${r1(r.w)} ${r1(e * 0.4)}V${r1(r.h)}H0Z')` : undefined;
  return (
    <>
      <div aria-hidden="true" style={{ position: "absolute", left: 0, top: r1(r.y), width: r1(r.w), height: r1(r.h), background: F.bg, clipPath: clip, borderTop: clip ? undefined : `${r1(Math.max(2, e * 0.35))}px solid ${F.accent}` }} />
      <footer data-ev-footer="" style={{ position: "absolute", left: r1(inner.x), top: r1(inner.y), width: r1(inner.w), height: r1(inner.h), display: "flex", flexDirection: b.side ? "row" : "column", alignItems: "center", justifyContent: b.side ? "space-between" : "center", gap: r1(b.side ? H * 0.2 : b.val * 0.25), color: fg, fontFamily: fontStack("Inter"), overflow: "hidden", textAlign: "center" }}>
        {chip}
        {b.side ? <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: r1(b.c * 0.1) }}>{rest}</div> : rest}
      </footer>
    </>
  );
}
