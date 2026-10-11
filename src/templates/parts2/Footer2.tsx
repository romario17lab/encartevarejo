// Rodapé (v2): pílula escura com a validade em destaque, contatos e o texto legal informado pela loja.
// Mesmo desenho em todos os formatos; respeita a área segura (story: 120 px).
import type { ReactElement } from "react";
import type { RenderCampaign } from "@/domain/campaign";
import { ensureContrast } from "../parts/color";
import { AtGlyph, CalendarGlyph, ChatGlyph, ClockGlyph, GlobeGlyph, PhoneGlyph, PinGlyph } from "../parts/glyphs";
import { clamp, fitLines, fitWidth, fontStack, r1, textWidth, type Face } from "./measure";
import { safeInner2 } from "./Header2";
import type { Ctx2 } from "./look";

type Contact = { key: string; text: string; Icon: (p: { size: number; color: string }) => ReactElement };

export function contacts2(c: RenderCampaign): Contact[] {
  const b = c.brand;
  const list: Contact[] = [];
  if (b.address) list.push({ key: "addr", text: b.address, Icon: PinGlyph });
  if (b.phone) list.push({ key: "tel", text: b.phone, Icon: PhoneGlyph });
  if (b.whatsapp) list.push({ key: "wa", text: `WhatsApp ${b.whatsapp}`, Icon: ChatGlyph });
  if (b.hours) list.push({ key: "hr", text: b.hours, Icon: ClockGlyph });
  if (b.instagram) list.push({ key: "ig", text: b.instagram.startsWith("@") ? b.instagram : `@${b.instagram}`, Icon: AtGlyph });
  if (b.website) list.push({ key: "web", text: b.website.replace(/^https?:\/\//, ""), Icon: GlobeGlyph });
  return list;
}

/** Quebra a lista de contatos em no máximo `lines` linhas (gulosa), devolvendo as linhas. */
function packContacts(list: Contact[], face: Face, fs: number, w: number, lines: number): Contact[][] | null {
  const out: Contact[][] = [[]];
  let cur = 0;
  for (const c of list) {
    const cw = textWidth(c.text, face, fs) + fs * 1.5;
    const gap = out[out.length - 1].length ? fs * 1.2 : 0;
    if (cur + gap + cw <= w) { out[out.length - 1].push(c); cur += gap + cw; continue; }
    if (cw > w || out.length >= lines) return null;
    out.push([c]);
    cur = cw;
  }
  return out;
}

export function Footer2({ ctx }: { ctx: Ctx2 }): ReactElement | null {
  const { page, look, campaign } = ctx;
  const r = page.footer;
  if (r.h <= 0 || r.w <= 0) return null;
  const inner = safeInner2(r, ctx, r1(clamp(r.w * 0.02, 6, 48)), r1(clamp(r.h * 0.09, 3, 22)));
  const F = look.footer;
  const bg = F.bg;
  const fg = ensureContrast(F.fg, bg, 7);
  const acc = ensureContrast(F.accent, bg, 4.5);
  const face: Face = { family: "Inter", weight: 700 };
  const bold: Face = { family: "Inter", weight: 900 };
  const contacts = contacts2(campaign);
  const legal = campaign.legalText?.trim() || null;
  const radius = Math.min(inner.h / 2, 60);
  const padX = Math.min(radius * 0.9, inner.w * 0.04) + inner.h * 0.08;
  const W = inner.w - padX * 2;
  const H = inner.h * 0.9;

  // escolhe a combinação (linhas de contato × linhas legais) que deixa o menor texto mais legível
  let best: { val: number; c: number; cl: Contact[][]; l: number; ll: string[]; score: number } | null = null;
  for (const cLines of contacts.length ? [1, 2] : [0]) {
    for (const lLines of legal ? [1, 2] : [0]) {
      let val = Math.min(H * 0.42, fitWidth(campaign.validityText.toLocaleUpperCase("pt-BR"), bold, W - H * 0.3, H, 6));
      let c = 0, pack: Contact[][] = [];
      if (cLines) {
        c = val * 0.85;
        while (c > 5.5) { const p = packContacts(contacts, face, c, W, cLines); if (p) { pack = p; break; } c *= 0.95; }
        if (!pack.length) { c = 5.5; pack = packContacts(contacts, face, c, W, 9) ?? [contacts]; }
      }
      let l = 0, lines: string[] = [];
      if (lLines) {
        const f = fitLines(legal!, face, W, (c || val) * 0.92 * 1.2 * lLines, { maxFs: (c || val) * 0.9, minFs: 5.5, maxLines: lLines, lineHeight: 1.2 });
        l = f.fs; lines = f.truncated ? [...f.lines.slice(0, -1), `${f.lines[f.lines.length - 1]}…`] : f.lines;
      }
      const total = val * 1.25 + pack.length * c * 1.3 + lines.length * l * 1.2;
      const k = Math.min(1, H / total);
      val *= k; c *= k; l *= k;
      if (k < 1 && lLines) {
        const f = fitLines(legal!, face, W, l * 1.2 * lLines, { maxFs: l, minFs: 5.5, maxLines: lLines, lineHeight: 1.2 });
        l = f.fs; lines = f.truncated ? [...f.lines.slice(0, -1), `${f.lines[f.lines.length - 1]}…`] : f.lines;
      }
      const score = Math.min(val * 0.75, c || val, (l || val) * 1.15) * 3 + val;
      if (!best || score > best.score) best = { val, c, cl: pack, l, ll: lines, score };
    }
  }
  const b = best!;
  return (
    <footer data-ev-footer="" style={{ position: "absolute", left: r1(inner.x), top: r1(inner.y), width: r1(inner.w), height: r1(inner.h), background: `linear-gradient(180deg, #2a2a2a 0%, ${bg} 45%)`, borderRadius: r1(radius), boxShadow: `0 3px 0 rgba(0,0,0,.35)${F.edge ? `, inset 0 0 0 ${r1(Math.max(1.5, inner.h * 0.03))}px ${F.edge}` : ""}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: r1(b.val * 0.12), color: fg, fontFamily: fontStack("Inter"), overflow: "hidden", textAlign: "center" }}>
      <div data-ev-validity="" style={{ display: "flex", alignItems: "center", gap: r1(b.val * 0.35), fontSize: r1(b.val), fontWeight: 900, lineHeight: 1.15, color: acc, whiteSpace: "nowrap" }}>
        <CalendarGlyph size={r1(b.val * 1.05)} color={acc} />
        <span>{campaign.validityText.toLocaleUpperCase("pt-BR")}</span>
      </div>
      {b.cl.map((line, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "center", columnGap: r1(b.c * 1.2), fontSize: r1(b.c), fontWeight: 700, lineHeight: 1.25, whiteSpace: "nowrap" }}>
          {line.map((c) => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: r1(b.c * 0.3) }}>
              <c.Icon size={r1(b.c * 1.05)} color={acc} />
              {c.text}
            </span>
          ))}
        </div>
      ))}
      {b.ll.length > 0 && (
        <div data-ev-legal="" style={{ fontSize: r1(b.l), fontWeight: 600, lineHeight: 1.2, opacity: 0.9 }}>
          {b.ll.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
        </div>
      )}
    </footer>
  );
}
