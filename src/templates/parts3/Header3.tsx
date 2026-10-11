// Cabeçalho (v3): fundo em camadas (ou o fundo da página continuando), logo emoldurada, título em camadas
// centralizado, fita inclinada com o subtítulo, objeto temático e cantos de kit sazonal.
import type { CSSProperties, ReactElement } from "react";
import { ensureContrast } from "../parts/color";
import { clamp, fitLines, fontStack, r1 } from "../parts2/measure";
import { safeInner2 } from "../parts2/Header2";
import { Ribbon } from "../parts2/Ribbon";
import { ThemeObject } from "../parts2/objects";
import { hid } from "../parts2/look";
import { Layers3 } from "./layers";
import { Title3 } from "./Title3";
import { KitCorners, SEASON_KITS } from "./deco";
import type { Ctx3 } from "./look3";

/** Palavra principal do título (camada "palavra repetida" do fundo). */
export function campaignWord(title: string): string {
  const words = title.trim().split(/\s+/).filter((w) => w.length > 3);
  return (words.sort((a, b) => b.length - a.length)[0] ?? title).toLocaleUpperCase("pt-BR");
}

function edgePath(kind: string, w: number, h: number, e: number): string | undefined {
  const W = r1(w), H = r1(h);
  switch (kind) {
    case "slant": return `polygon(0 0, ${W}px 0, ${W}px ${r1(h - e)}px, 0 ${H}px)`;
    case "arc": return `path('M0 0H${W}V${r1(h - e)}Q${r1(w / 2)} ${r1(h + e)} 0 ${r1(h - e)}Z')`;
    case "zigzag": {
      const n = Math.max(8, Math.round(w / (e * 2.2)));
      const pts = [`0 0`, `${W}px 0`];
      for (let i = n; i >= 0; i--) pts.push(`${r1((w * i) / n)}px ${i % 2 ? r1(h - e) : H}px`);
      return `polygon(${pts.join(",")})`;
    }
    case "wave": case "snow": case "gingham": case "torn": case "scallop": {
      const n = 3, sw = w / n;
      let d = `M0 0H${W}V${r1(h - e * 0.5)}`;
      for (let i = n; i > 0; i--) d += `C${r1(sw * (i - 0.25))} ${r1(h + e * 0.5)} ${r1(sw * (i - 0.75))} ${r1(h - e * 1.5)} ${r1(sw * (i - 1))} ${r1(h - e * 0.5)}`;
      return `path('${d}Z')`;
    }
    default: return undefined;
  }
}

/** Logo emoldurada (borda grossa + sombra dura) ou nome da loja num selo. */
export function LogoFrame3({ ctx, x, y, w, h }: { ctx: Ctx3; x: number; y: number; w: number; h: number }): ReactElement {
  const { brand } = ctx.campaign;
  const L = ctx.look.logo;
  const S = Math.min(w, h);
  const bw = r1(clamp(S * 0.05, 2, 9));
  const box: CSSProperties = { position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: L.bg, border: `${bw}px solid ${L.border}`, borderRadius: r1(S * 0.18), boxShadow: `${r1(S * 0.05)}px ${r1(S * 0.05)}px 0 rgba(0,0,0,.4)`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" };
  if (brand.logoUrl) {
    return (
      <div data-ev-logo="" style={{ ...box, padding: r1(S * 0.08) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt={`Logo ${brand.storeName}`} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }
  const face = ctx.look.title.face;
  const text = brand.storeName.toLocaleUpperCase("pt-BR");
  const fit = fitLines(text, face, w - bw * 2 - S * 0.16, h - bw * 2 - S * 0.12, { maxFs: h * 0.36, minFs: 6, maxLines: 3, lineHeight: 1.0 });
  return (
    <div data-ev-logo="texto" style={box}>
      <div style={{ fontFamily: fontStack(face.family), fontWeight: face.weight, fontStyle: face.italic ? "italic" : undefined, fontSize: fit.fs, lineHeight: 1.0, color: ensureContrast(L.fg, L.bg, 4.5), textAlign: "center" }}>
        {fit.lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
      </div>
    </div>
  );
}

function PageNo3({ ctx, x, y, size }: { ctx: Ctx3; x: number; y: number; size: number }) {
  const { page, look } = ctx;
  if (page.totalPages <= 1) return null;
  const bg = look.footer.bg;
  return (
    <div data-ev-pageno="" aria-label={`Página ${page.pageIndex + 1} de ${page.totalPages}`}
      style={{ position: "absolute", left: r1(x - size * 2), top: r1(y), width: r1(size * 2), height: r1(size), borderRadius: r1(size / 2), background: bg, color: ensureContrast(look.footer.accent, bg, 4.5), border: `2px solid ${look.footer.accent}`, boxShadow: `${r1(size * 0.08)}px ${r1(size * 0.08)}px 0 rgba(0,0,0,.35)`, fontFamily: fontStack("Inter"), fontWeight: 900, fontSize: r1(size * 0.5), display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
      {page.pageIndex + 1}/{page.totalPages}
    </div>
  );
}

export function Header3({ ctx }: { ctx: Ctx3 }): ReactElement | null {
  const { page, look, campaign, overrides } = ctx;
  const r = page.header;
  if (r.h <= 0 || r.w <= 0) return null;
  const compact = page.variant === "continuation";
  const title = (overrides.title ?? campaign.title).trim();
  const kit = look.kit ? SEASON_KITS[look.kit] : null;
  const subtitle = compact ? null : ((overrides.subtitle ?? campaign.subtitle)?.trim() || null);
  const H = kit?.header && look.header.ground ? { ...look.header, ground: { ...look.header.ground, ...kit.header }, object: undefined } : look.header;
  const e = r1(clamp(r.h * 0.09, 6, 36));
  const padY = r1(clamp(r.h * 0.07, 4, 30));
  const padX = r1(clamp(r.w * 0.025, 8, 52));
  const inner = safeInner2(r, ctx, padX, padY);
  const els: ReactElement[] = [];
  const pageSize = r1(clamp(inner.h * 0.24, 14, 44));
  const pages = page.totalPages > 1;

  if (H.ground) {
    const clip = edgePath(H.edge, r.w, r.h + e, e);
    const stripe = r1(Math.max(3, e * 0.5));
    if (H.edge !== "none") els.push(<div key="st" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: r1(r.w), height: r1(r.h + e + stripe), clipPath: edgePath(H.edge, r.w, r.h + e + stripe, e), background: kit?.band ? `repeating-linear-gradient(-45deg, ${kit.band.colors.map((c, i, a) => `${c} ${r1((i * 100) / a.length)}% ${r1(((i + 1) * 100) / a.length)}%`).join(", ")})` : H.edgeColor, backgroundSize: kit?.band ? `${r1(stripe * 4)}px ${r1(stripe * 4)}px` : undefined }} />);
    els.push(
      <div key="gr" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: r1(r.w), height: r1(r.h + e), clipPath: H.edge === "none" ? undefined : clip, overflow: "hidden" }}>
        <Layers3 g={H.ground} w={r.w} h={r.h + e} word={campaignWord(title)} seed={5} focus="50% 70%" />
      </div>,
    );
  }
  if (kit) els.push(<KitCorners key="kit" kit={kit} x={0} y={0} w={r.w} h={r.h} />);

  if (compact) {
    const logoW = Math.min(inner.w * 0.2, inner.h * 1.6);
    els.push(<LogoFrame3 key="lg" ctx={ctx} x={inner.x} y={inner.y + inner.h * 0.06} w={logoW} h={inner.h * 0.88} />);
    const right = inner.x + inner.w - (pages ? pageSize * 2.3 : 0);
    const tx = inner.x + logoW + padX;
    els.push(<Title3 key="tt" text={title} x={tx} y={inner.y} w={Math.max(10, right - padX * 0.5 - tx)} h={inner.h} style={look.title} single />);
    els.push(<PageNo3 key="pg" ctx={ctx} x={inner.x + inner.w} y={inner.y + (inner.h - pageSize) / 2} size={pageSize} />);
  } else {
    const ar = inner.w / inner.h;
    const wide = ar > 4.2;
    const ribH = subtitle ? r1(clamp(inner.h * (wide ? 0.26 : 0.22), 13, 72)) : 0;
    if (wide) {
      const logoH = r1(inner.h * 0.82);
      const logoW = r1(Math.min(inner.w * 0.17, logoH * 1.45));
      els.push(<LogoFrame3 key="lg" ctx={ctx} x={inner.x} y={inner.y + (inner.h - logoH) / 2} w={logoW} h={logoH} />);
      const objS = H.object ? r1(Math.min(inner.w * 0.15, (r.h + e - inner.y) * 1.05)) : 0;
      const reserve = Math.max(logoW, objS) + padX;
      const tx = inner.x + reserve;
      const tw = inner.w - reserve * 2 - (pages ? pageSize * 2.2 : 0);
      if (H.object) els.push(<ThemeObject key="ob" kind={H.object} x={inner.x + inner.w - objS - (pages ? pageSize * 2.2 : 0)} y={r.y + r.h + e - objS * 0.96} w={objS} h={objS} />);
      els.push(<Title3 key="tt" text={title} x={tx} y={inner.y} w={tw} h={inner.h - ribH} style={look.title} />);
      if (subtitle) els.push(<Ribbon key="rb" text={subtitle} x={tx + tw * 0.1} y={inner.y + inner.h - ribH} w={tw * 0.8} h={ribH} bg={look.ribbon.bg} fg={look.ribbon.fg} face={look.ribbon.face} angle={-2} seed={Number.parseInt(hid(subtitle).slice(0, 3), 36) % 97} />);
      els.push(<PageNo3 key="pg" ctx={ctx} x={inner.x + inner.w} y={inner.y} size={pageSize} />);
    } else {
      // logo no canto, título centralizado com colunas simétricas (o objeto ocupa a coluna da direita)
      const logoH = r1(clamp(inner.h * 0.4, 26, 140));
      const logoW = r1(logoH * 1.38);
      const gap = padX * 0.8;
      const sym = inner.w - 2 * (logoW + gap) >= inner.w * 0.55;
      const tx = inner.x + logoW + gap;
      const tw = sym ? inner.w - 2 * (logoW + gap) : inner.w - logoW - gap;
      els.push(<LogoFrame3 key="lg" ctx={ctx} x={inner.x} y={inner.y} w={logoW} h={logoH} />);
      if (H.object && sym && !kit) {
        const objS = r1(Math.min((logoW + gap) * 1.25, inner.h * 1.05));
        els.push(<ThemeObject key="ob" kind={H.object} x={inner.x + inner.w - objS * 0.92} y={r.y + r.h + e * 0.6 - objS * 0.98} w={objS} h={objS} />);
      }
      const th = inner.h - ribH * 0.95;
      els.push(<Title3 key="tt" text={title} x={tx} y={inner.y} w={tw} h={th} style={look.title} />);
      if (subtitle) els.push(<Ribbon key="rb" text={subtitle} x={tx + tw * 0.06} y={inner.y + inner.h - ribH} w={tw * 0.88} h={ribH} bg={look.ribbon.bg} fg={look.ribbon.fg} face={look.ribbon.face} angle={-2.2} seed={Number.parseInt(hid(subtitle).slice(0, 3), 36) % 97} />);
      els.push(<PageNo3 key="pg" ctx={ctx} x={inner.x + inner.w} y={inner.y + inner.h - pageSize - ribH} size={pageSize} />);
    }
  }
  return <header data-ev-header="" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>{els}</header>;
}
