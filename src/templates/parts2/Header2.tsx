// Cabeçalho (v2): fundo com profundidade e borda recortada, logo emoldurada, título 3D,
// fita inclinada com o subtítulo e objeto temático que vaza do quadro.
import type { CSSProperties, ReactElement } from "react";
import type { Rect } from "../contract";
import { ensureContrast } from "../parts/color";
import { clamp, fitLines, fontStack, r1 } from "./measure";
import { GroundFill } from "./grounds";
import { ThemeObject } from "./objects";
import { Title3D } from "./Title3D";
import { Ribbon } from "./Ribbon";
import { hid, type Ctx2, type EdgeKind } from "./look";

/** Área útil de um retângulo, descontando a margem de segurança do formato quando ele encosta na borda. */
export function safeInner2(r: Rect, ctx: Pick<Ctx2, "format">, padX: number, padY: number): Rect {
  const s = ctx.format.safeAreaPx;
  const W = ctx.format.widthPx;
  const H = ctx.format.heightPx;
  const l = Math.max(r.x + padX, s);
  const t = Math.max(r.y + padY, Math.min(s, r.y + r.h * 0.45));
  const rr = Math.min(r.x + r.w - padX, W - s);
  const b = Math.min(r.y + r.h - padY, Math.max(H - s, r.y + r.h * 0.55));
  return { x: l, y: t, w: Math.max(10, rr - l), h: Math.max(10, b - t) };
}

/** clip-path da borda inferior do cabeçalho (px absolutos). */
function edgeClip(kind: EdgeKind, w: number, h: number, e: number, seed = 1): string | undefined {
  const W = r1(w), H = r1(h), E = r1(e);
  switch (kind) {
    case "straight": return undefined;
    case "slant": return `polygon(0 0, ${W}px 0, ${W}px ${r1(h - e)}px, 0 ${H}px)`;
    case "zigzag": {
      const n = Math.max(8, Math.round(w / (e * 2.2)));
      const pts = [`0 0`, `${W}px 0`];
      for (let i = n; i >= 0; i--) pts.push(`${r1((w * i) / n)}px ${i % 2 ? r1(h - e) : H}px`);
      return `polygon(${pts.join(",")})`;
    }
    case "torn": {
      let s = seed * 104729;
      const rnd = () => ((s = (s * 48271) % 2147483647) % 1000) / 1000;
      const n = Math.max(16, Math.round(w / (e * 0.9)));
      const pts = [`0 0`, `${W}px 0`];
      for (let i = n; i >= 0; i--) pts.push(`${r1((w * i) / n)}px ${r1(h - e * (0.15 + 0.85 * rnd()))}px`);
      return `polygon(${pts.join(",")})`;
    }
    case "arc": return `path('M0 0H${W}V${r1(h - e)}Q${r1(w / 2)} ${r1(h + e)} 0 ${r1(h - e)}Z')`;
    case "scallop": {
      const n = Math.max(6, Math.round(w / (e * 2.6)));
      const sw = w / n;
      let d = `M0 0H${W}V${r1(h - e)}`;
      for (let i = n; i > 0; i--) d += `Q${r1(sw * (i - 0.5))} ${r1(h + e * 0.6)} ${r1(sw * (i - 1))} ${r1(h - e)}`;
      return `path('${d}Z')`;
    }
    case "wave":
    case "snow":
    case "gingham":
    default: {
      const n = 3;
      const sw = w / n;
      let d = `M0 0H${W}V${r1(h - e * 0.5)}`;
      for (let i = n; i > 0; i--) d += `C${r1(sw * (i - 0.25))} ${r1(h + e * 0.5)} ${r1(sw * (i - 0.75))} ${r1(h - e * 1.5)} ${r1(sw * (i - 1))} ${r1(h - e * 0.5)}`;
      return `path('${d}Z')`;
    }
  }
}

/** Logo emoldurada (borda grossa + sombra) ou nome da loja num selo. */
export function LogoFrame({ ctx, x, y, w, h }: { ctx: Ctx2; x: number; y: number; w: number; h: number }): ReactElement {
  const { brand } = ctx.campaign;
  const L = ctx.look.logo;
  const S = Math.min(w, h);
  const bw = r1(clamp(S * 0.06, 2, 10));
  const box: CSSProperties = { position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: L.bg, border: `${bw}px solid ${L.border}`, borderRadius: r1(S * 0.16), boxShadow: `0 ${r1(S * 0.04)}px 0 rgba(0,0,0,.35), 0 ${r1(S * 0.06)}px ${r1(S * 0.12)}px rgba(0,0,0,.35)`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transform: "rotate(-2deg)" };
  if (brand.logoUrl) {
    return (
      <div data-ev-logo="" style={{ ...box, padding: r1(S * 0.08) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt={`Logo ${brand.storeName}`} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }
  const face = { family: ctx.look.title.face.family, weight: ctx.look.title.face.weight, italic: ctx.look.title.face.italic };
  const text = brand.storeName.toLocaleUpperCase("pt-BR");
  const fit = fitLines(text, face, w - bw * 2 - S * 0.16, h - bw * 2 - S * 0.12, { maxFs: h * 0.4, minFs: 6, maxLines: 3, lineHeight: 1.0 });
  return (
    <div data-ev-logo="texto" style={box}>
      <div style={{ fontFamily: fontStack(face.family), fontWeight: face.weight, fontStyle: face.italic ? "italic" : undefined, fontSize: fit.fs, lineHeight: 1.0, color: ensureContrast(L.fg, L.bg, 4.5), textAlign: "center" }}>
        {fit.lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
      </div>
    </div>
  );
}

function PageNo({ ctx, x, y, size }: { ctx: Ctx2; x: number; y: number; size: number }) {
  const { page, look } = ctx;
  if (page.totalPages <= 1) return null;
  const bg = "#111111";
  return (
    <div data-ev-pageno="" aria-label={`Página ${page.pageIndex + 1} de ${page.totalPages}`}
      style={{ position: "absolute", left: r1(x - size * 2), top: r1(y), width: r1(size * 2), height: r1(size), borderRadius: r1(size / 2), background: bg, color: ensureContrast(look.footer.accent, bg, 4.5), border: `2px solid ${look.footer.accent}`, fontFamily: fontStack("Inter"), fontWeight: 900, fontSize: r1(size * 0.5), display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
      {page.pageIndex + 1}/{page.totalPages}
    </div>
  );
}

export function headerEdge(r: Rect) {
  return r1(clamp(r.h * 0.1, 6, 40));
}

export function Header2({ ctx }: { ctx: Ctx2 }): ReactElement | null {
  const { page, look, campaign, overrides } = ctx;
  const r = page.header;
  if (r.h <= 0 || r.w <= 0) return null;
  const compact = page.variant === "continuation";
  const title = (overrides.title ?? campaign.title).trim();
  const subtitle = compact ? null : (overrides.subtitle ?? campaign.subtitle)?.trim() || null;
  const e = headerEdge(r);
  const stripe = r1(Math.max(3, e * 0.45));
  const padY = r1(clamp(r.h * 0.07, 4, 34));
  const padX = r1(clamp(r.w * 0.025, 8, 56));
  const inner = safeInner2(r, ctx, padX, padY);
  const H = look.header;
  const clip = edgeClip(H.edge, r.w, r.h + e, e, 3);
  const clipStripe = edgeClip(H.edge, r.w, r.h + e + stripe, e, 3);
  const els: ReactElement[] = [];
  const pageSize = r1(clamp(inner.h * 0.22, 14, 46));
  const pages = page.totalPages > 1;

  // fundo + faixa de contraste acompanhando a borda
  els.push(
    <div key="stripe" aria-hidden="true" style={{ position: "absolute", left: r1(r.x), top: r1(r.y), width: r1(r.w), height: r1(r.h + e + stripe), clipPath: clipStripe, background: H.edge === "gingham" ? `repeating-conic-gradient(${H.edgeColor} 0 25%, #ffffff 0 50%) 0 0 / ${r1(stripe * 2.4)}px ${r1(stripe * 2.4)}px` : H.edgeColor, filter: "drop-shadow(0 3px 3px rgba(0,0,0,.35))" }} />,
  );
  if (H.edge === "gingham") {
    els.push(<div key="ging" aria-hidden="true" style={{ position: "absolute", left: r1(r.x), top: r1(r.y), width: r1(r.w), height: r1(r.h + e + stripe * 2.2), clipPath: edgeClip("wave", r.w, r.h + e + stripe * 2.2, e, 3), background: `repeating-conic-gradient(${H.edgeColor} 0 25%, #ffffff 0 50%) 0 0 / ${r1(stripe * 2.2)}px ${r1(stripe * 2.2)}px` }} />);
  }
  els.push(
    <div key="ground" aria-hidden="true" style={{ position: "absolute", left: r1(r.x), top: r1(r.y), width: r1(r.w), height: r1(r.h + e), clipPath: clip, overflow: "hidden" }}>
      <GroundFill g={H.ground} w={r.w} h={r.h + e} seed={7} focus={compact ? "50% 50%" : "50% 62%"} />
    </div>,
  );
  if (H.edge === "snow") {
    // neve acumulada na borda: cobertura branca ondulada com gotas
    const n = Math.max(6, Math.round(r.w / (e * 3)));
    let d = `M0 ${r1(r.h - e * 0.9)}`;
    for (let i = 0; i < n; i++) {
      const x0 = (r.w * i) / n, x1 = (r.w * (i + 1)) / n, drip = e * (0.6 + ((i * 37) % 10) / 10);
      d += `C${r1(x0 + (x1 - x0) * 0.2)} ${r1(r.h - e * 0.9 + drip)} ${r1(x0 + (x1 - x0) * 0.45)} ${r1(r.h - e * 0.9 + drip * 1.4)} ${r1(x0 + (x1 - x0) * 0.6)} ${r1(r.h - e * 0.5)}Q${r1(x0 + (x1 - x0) * 0.8)} ${r1(r.h - e * 1.4)} ${r1(x1)} ${r1(r.h - e * 0.9)}`;
    }
    d += `V${r1(r.h - e * 1.6)}H0Z`;
    els.push(<svg key="snow" aria-hidden="true" width={r1(r.w)} height={r1(r.h + e * 2)} style={{ position: "absolute", left: 0, top: 0, filter: "drop-shadow(0 2px 2px rgba(0,0,0,.25))" }}><path d={d} fill="#ffffff" /></svg>);
  }

  if (compact) {
    const logoW = Math.min(inner.w * 0.2, inner.h * 1.7);
    els.push(<LogoFrame key="lg" ctx={ctx} x={inner.x} y={inner.y + inner.h * 0.06} w={logoW} h={inner.h * 0.88} />);
    const objS = Math.min(inner.h * 1.25, inner.w * 0.14);
    const right = inner.x + inner.w - (pages ? pageSize * 2.3 : 0);
    els.push(<ThemeObject key="ob" kind={H.object} x={right - objS} y={r.y + r.h + e - objS * 0.98} w={objS} h={objS} />);
    const tx = inner.x + logoW + padX;
    els.push(<Title3D key="tt" text={title} x={tx} y={inner.y} w={right - objS - padX * 0.5 - tx} h={inner.h} style={look.title} maxLines={1} />);
    els.push(<PageNo key="pg" ctx={ctx} x={inner.x + inner.w} y={inner.y + (inner.h - pageSize) / 2} size={pageSize} />);
  } else {
    const ar = inner.w / inner.h;
    const logoW = r1(clamp(inner.h * 1.3, inner.w * 0.15, inner.w * 0.23));
    const logoH = r1(Math.min(inner.h * 0.78, logoW * 0.82));
    els.push(<LogoFrame key="lg" ctx={ctx} x={inner.x} y={inner.y + (inner.h - logoH) / 2} w={logoW} h={logoH} />);
    const objS = r1(Math.min(inner.w * (ar > 6 ? 0.16 : 0.25), (r.h + e - inner.y + r.y) * 1.08, inner.h * 1.45));
    const objX = inner.x + inner.w - objS * 0.98 - (pages ? pageSize * 1.2 : 0);
    const objY = r.y + r.h + e - objS * 0.96;
    const ribH = subtitle ? r1(clamp(inner.h * 0.24, 13, 76)) : 0;
    const tx = inner.x + logoW + padX * 1.1;
    const tw = objX + objS * 0.06 - padX * 0.6 - tx;
    const th = inner.h - ribH * 0.72;
    els.push(<ThemeObject key="ob" kind={H.object} x={objX} y={objY} w={objS} h={objS} />);
    els.push(<Title3D key="tt" text={title} x={tx} y={inner.y - inner.h * 0.02} w={tw} h={th + inner.h * 0.02} style={look.title} maxLines={ar > 7 ? 2 : 3} valign={subtitle ? "top" : "center"} />);
    if (subtitle) els.push(<Ribbon key="rb" text={subtitle} x={tx + tw * 0.04} y={inner.y + inner.h - ribH} w={tw * 0.92} h={ribH} bg={look.ribbon.bg} fg={look.ribbon.fg} face={look.ribbon.face} angle={-2.5} seed={Number.parseInt(hid(subtitle).slice(0, 3), 36) % 97} />);
    els.push(<PageNo key="pg" ctx={ctx} x={inner.x + inner.w} y={inner.y} size={pageSize} />);
  }
  return <header data-ev-header="" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>{els}</header>;
}
