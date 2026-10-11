// Marca d'água de demonstração e títulos de seção (categorias).
import type { LayoutSection } from "../contract";
import { fontStack } from "./metrics";
import { clamp, fitOneLine, round } from "./text";
import { ensureContrast } from "./color";
import type { RenderCtx } from "./types";

/** Exibida quando campaign.isDemo: deixa claro que os dados não são reais. */
export function DemoWatermark({ w, h }: { w: number; h: number }) {
  const S = Math.min(w, h);
  const big = round(S * 0.075);
  const label = round(clamp(S * 0.022, 10, 26));
  const rows = Math.ceil(h / (big * 4)) + 1;
  return (
    <div data-ev-demo="" aria-label="Dados de demonstração" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 50 }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: Math.hypot(w, h), transform: `translate(-50%, -50%) rotate(${round(-Math.atan2(h, w) * 180 / Math.PI)}deg)`, display: "flex", flexDirection: "column", alignItems: "center", gap: big * 2.6 }}>
        {Array.from({ length: Math.max(1, Math.floor(rows / 2)) }, (_, i) => (
          <div key={i} style={{ fontFamily: fontStack("Inter"), fontWeight: 900, fontSize: big, color: "rgba(120,120,120,0.12)", whiteSpace: "nowrap", letterSpacing: "0.08em" }}>DADOS DE DEMONSTRAÇÃO</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", background: "#141414", color: "#ffffff", fontFamily: fontStack("Inter"), fontWeight: 800, fontSize: label, padding: `${round(label * 0.25)}px ${round(label * 0.8)}px`, borderRadius: `0 0 ${round(label * 0.5)}px ${round(label * 0.5)}px`, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
        DADOS DE DEMONSTRAÇÃO
      </div>
    </div>
  );
}

export function SectionTitle({ section, ctx }: { section: LayoutSection; ctx: RenderCtx }) {
  const { skin } = ctx;
  const { x, y, w, h } = section.rect;
  const s = skin.section;
  const df = skin.fonts.display;
  const fs = fitOneLine(section.title, w * 0.8, h * 0.62, { family: df.family, upper: true, minFs: 7 });
  const bg = s.style === "underline" ? "transparent" : s.bg;
  const fg = ensureContrast(s.fg, s.style === "underline" ? skin.card.bg : s.bg, 4.5);
  return (
    <div data-ev-section="" style={{ position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), display: "flex", alignItems: "center", justifyContent: s.style === "pill" ? "center" : "flex-start" }}>
      <div style={{ fontFamily: fontStack(df.family), fontWeight: df.weight, fontSize: fs, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.04em", color: fg, background: bg,
        padding: s.style === "underline" ? `0 0 ${round(fs * 0.15)}px` : `${round(fs * 0.22)}px ${round(fs * 0.7)}px`,
        borderRadius: s.style === "pill" ? round(fs) : round(fs * 0.15), borderBottom: s.style === "underline" ? `${Math.max(2, round(fs * 0.12))}px solid ${s.bg}` : undefined,
        width: s.style === "bar" ? "100%" : undefined, whiteSpace: "nowrap", overflow: "hidden" }}>
        {section.title}
      </div>
    </div>
  );
}
