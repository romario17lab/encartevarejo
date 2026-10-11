// Cabeçalho compartilhado: logo (ou nome da loja), título/subtítulo da campanha e
// indicador de página "1/3" em peças com várias páginas. Desenha dentro de page.header.
import type { CSSProperties, ReactElement } from "react";
import type { Rect } from "../contract";
import { fontStack } from "./metrics";
import { clamp, fitOneLine, fitText, round } from "./text";
import { ensureContrast, readableOn } from "./color";
import type { RenderCtx } from "./types";

/** Área útil de um retângulo, descontando a margem de segurança do formato quando ele encosta na borda. */
export function safeInner(r: Rect, ctx: RenderCtx, padX: number, padY: number): Rect {
  const s = ctx.format.safeAreaPx;
  const W = ctx.format.widthPx;
  const H = ctx.format.heightPx;
  const l = Math.max(r.x + padX, s);
  const t = Math.max(r.y + padY, Math.min(s, r.y + r.h * 0.45));
  const rr = Math.min(r.x + r.w - padX, W - s);
  const b = Math.min(r.y + r.h - padY, Math.max(H - s, r.y + r.h * 0.55));
  return { x: l, y: t, w: Math.max(10, rr - l), h: Math.max(10, b - t) };
}

/** Logo da loja (imagem) ou o nome da loja como marca tipográfica. */
export function StoreMark({ ctx, x, y, w, h, color, align = "center", plate, maxFsRatio = 0.34 }: { ctx: RenderCtx; x: number; y: number; w: number; h: number; color: string; align?: "left" | "center" | "right"; plate?: string; maxFsRatio?: number }) {
  const { brand } = ctx.campaign;
  const box: CSSProperties = { position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), display: "flex", alignItems: "center", justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" };
  if (brand.logoUrl) {
    const p = plate ? Math.min(w, h) * 0.08 : 0;
    return (
      <div data-ev-logo="" style={box}>
        <div style={{ background: plate, borderRadius: Math.min(w, h) * 0.12, padding: p, maxWidth: "100%", maxHeight: "100%", display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoUrl} alt={`Logo ${brand.storeName}`} style={{ width: round(w - 2 * p), height: round(h - 2 * p), objectFit: "contain", objectPosition: align === "left" ? "left center" : align === "right" ? "right center" : "center", display: "block" }} />
        </div>
      </div>
    );
  }
  const f = ctx.skin.fonts.display;
  const fit = fitText(brand.storeName, plate ? w * 0.78 : w * 0.96, plate ? h * 0.72 : h * 0.9, { family: f.family, upper: true, maxFs: h * maxFsRatio, minFs: 7, maxLines: 2, lineHeight: 1.02 });
  return (
    <div data-ev-logo="texto" style={box}>
      <div style={{ fontFamily: fontStack(f.family), fontWeight: f.weight, fontSize: fit.fontSize, lineHeight: 1.02, textTransform: "uppercase", color, textAlign: align, letterSpacing: "0.01em", overflow: "hidden", maxHeight: round(fit.height + 2), background: plate, padding: plate ? `${round(fit.fontSize * 0.2)}px ${round(fit.fontSize * 0.35)}px` : undefined, borderRadius: plate ? round(fit.fontSize * 0.25) : undefined }}>
        {brand.storeName}
      </div>
    </div>
  );
}

export function PageIndicator({ ctx, x, y, size, bg, fg }: { ctx: RenderCtx; x: number; y: number; size: number; bg: string; fg: string }) {
  const { page } = ctx;
  if (page.totalPages <= 1) return null;
  const t = `${page.pageIndex + 1}/${page.totalPages}`;
  return (
    <div data-ev-pageno="" aria-label={`Página ${page.pageIndex + 1} de ${page.totalPages}`}
      style={{ position: "absolute", left: round(x - size * 1.9), top: round(y), width: round(size * 1.9), height: round(size), borderRadius: round(size / 2), background: bg, color: ensureContrast(fg, bg), fontFamily: fontStack(ctx.skin.fonts.body.family), fontWeight: 800, fontSize: round(size * 0.48), display: "flex", alignItems: "center", justifyContent: "center" }}>
      {t}
    </div>
  );
}

export function Header({ ctx, decor }: { ctx: RenderCtx; decor?: ReactElement | null }) {
  const { page, skin, campaign, overrides } = ctx;
  const r = page.header;
  if (r.h <= 0 || r.w <= 0) return null;
  const hs = skin.header;
  const compact = page.variant === "continuation";
  const title = (overrides.title ?? campaign.title).trim();
  const subtitle = compact ? null : (overrides.subtitle ?? campaign.subtitle)?.trim() || null;
  const padY = round(clamp(r.h * 0.08, 4, 40));
  const padX = round(clamp(r.w * 0.03, 8, 64));
  const inner0 = safeInner(r, ctx, padX, padY);
  const it = (hs.insetTop ?? 0) * r.h;
  const inner = { ...inner0, y: inner0.y + it, h: Math.max(10, inner0.h - it) };
  const df = skin.fonts.display;
  const bg = hs.bg;
  const fg = ensureContrast(hs.fg, bg === "transparent" ? ctx.colors.background : bg, 3);
  const pageSize = round(clamp(inner.h * 0.26, 14, 48));
  const els: ReactElement[] = [];

  const titleBlock = (x: number, y: number, w: number, h: number, align: "left" | "center" | "right", color: string, accentBg: string, accentFg: string) => {
    const subH = subtitle ? h * 0.3 : 0;
    const tFit = fitText(title, w, h - subH, { family: df.family, upper: df.upper, maxFs: (h - subH) * (compact ? 0.8 : 0.9), minFs: 8, maxLines: 2, lineHeight: 1.08, letterSpacing: df.letterSpacing });
    const subFs = subtitle ? fitOneLine(subtitle, w * 0.92, subH * 0.62, { family: skin.fonts.body.family, minFs: 7 }) : 0;
    const ac = ensureContrast(accentFg, accentBg, 4.5);
    return (
      <div key="tt" style={{ position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), display: "flex", flexDirection: "column", justifyContent: "center", alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center", gap: round(subFs * 0.25) }}>
        <h1 data-ev-title="" style={{ margin: 0, fontFamily: fontStack(df.family), fontWeight: df.weight, fontStyle: df.italic ? "italic" : undefined, fontSize: tFit.fontSize, lineHeight: 1.08, textTransform: df.upper ? "uppercase" : undefined, letterSpacing: df.letterSpacing ? `${df.letterSpacing}em` : undefined, color, textAlign: align, maxWidth: "100%", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontFamily: fontStack(skin.fonts.body.family), fontWeight: 800, fontSize: subFs, lineHeight: 1.15, color: ac, background: accentBg, padding: `${round(subFs * 0.18)}px ${round(subFs * 0.55)}px`, borderRadius: round(subFs * 0.3), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{subtitle}</div>
        )}
      </div>
    );
  };

  const wideHeader = inner.w / inner.h > 2.2;
  switch (hs.variant) {
    case "centered": {
      if (wideHeader && inner.w / inner.h > 5) {
        // faixa larga (TV, banner): logo à esquerda, título central
        const lw = inner.h * 2.2;
        els.push(<StoreMark key="lg" ctx={ctx} x={inner.x} y={inner.y} w={lw} h={inner.h} color={fg} align="left" />);
        els.push(titleBlock(inner.x + lw, inner.y, inner.w - lw * 2, inner.h, "center", fg, hs.accent, hs.accentFg));
      } else {
        const logoH = compact ? 0 : inner.h * 0.22;
        if (logoH) els.push(<StoreMark key="lg" ctx={ctx} x={inner.x + inner.w * 0.25} y={inner.y} w={inner.w * 0.5} h={logoH} color={fg} maxFsRatio={0.75} />);
        els.push(titleBlock(inner.x + inner.w * 0.06, inner.y + logoH, inner.w * 0.88, inner.h - logoH, "center", fg, hs.accent, hs.accentFg));
        if (compact) els.push(<StoreMark key="lg2" ctx={ctx} x={inner.x} y={inner.y} w={inner.w * 0.18} h={inner.h} color={fg} align="left" />);
      }
      break;
    }
    case "split": {
      const leftW = inner.w * (wideHeader ? 0.66 : 0.6);
      els.push(titleBlock(inner.x, inner.y, leftW - padX, inner.h, "left", fg, hs.accent, hs.accentFg));
      const plateBg = "#ffffff";
      els.push(<StoreMark key="lg" ctx={ctx} x={inner.x + leftW + padX * 0.5} y={inner.y + inner.h * 0.1} w={inner.w - leftW - padX * 0.5 - (page.totalPages > 1 ? pageSize * 2.2 : 0)} h={inner.h * 0.8} color={readableOn(plateBg)} plate={plateBg} />);
      break;
    }
    case "minimal": {
      const logoW = Math.min(inner.w * 0.3, inner.h * 2.6);
      els.push(titleBlock(inner.x, inner.y, inner.w - logoW - padX - (page.totalPages > 1 ? pageSize * 2.2 : 0), inner.h, "left", fg, hs.accent, hs.accentFg));
      els.push(<StoreMark key="lg" ctx={ctx} x={inner.x + inner.w - logoW - (page.totalPages > 1 ? pageSize * 2.2 : 0)} y={inner.y + inner.h * 0.15} w={logoW} h={inner.h * 0.7} color={fg} align="right" />);
      els.push(<div key="rule" style={{ position: "absolute", left: inner.x, top: round(r.y + r.h - Math.max(2, r.h * 0.025)), width: inner.w, height: Math.max(2, round(r.h * 0.025)), background: hs.accent }} />);
      break;
    }
    default: {
      // band: logo à esquerda, título à direita
      const logoW = Math.min(inner.w * 0.3, inner.h * (wideHeader ? 2.2 : 1.6));
      els.push(<StoreMark key="lg" ctx={ctx} x={inner.x} y={inner.y} w={logoW} h={inner.h} color={fg} align="left" maxFsRatio={0.42} />);
      const tx = inner.x + logoW + padX;
      els.push(titleBlock(tx, inner.y, inner.x + inner.w - tx - (page.totalPages > 1 ? pageSize * 2.2 : 0), inner.h, wideHeader ? "center" : "right", fg, hs.accent, hs.accentFg));
    }
  }

  return (
    <header data-ev-header="" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {bg !== "transparent" && <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, background: bg }} />}
      {decor}
      {els}
      <PageIndicator ctx={ctx} x={inner.x + inner.w} y={inner.y} size={pageSize} bg={hs.accent} fg={hs.accentFg} />
    </header>
  );
}
