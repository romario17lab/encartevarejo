// Pequenos ícones desenhados para os modelos (SVG próprio, traço simples).
import type { CSSProperties } from "react";

type G = { size: number; color: string; style?: CSSProperties };
const base = (size: number, style?: CSSProperties): CSSProperties => ({ width: size, height: size, flex: "none", display: "inline-block", verticalAlign: "middle", ...style });

export const PinGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke={color} strokeWidth="2.4" /><circle cx="12" cy="10" r="2.6" fill={color} /></svg>
);
export const PhoneGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><path d="M6.5 3h3l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z" fill={color} /></svg>
);
/** Balão de conversa genérico (não é o logotipo de nenhum aplicativo). */
export const ChatGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke={color} strokeWidth="3" strokeLinecap="round" /></svg>
);
export const ClockGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.4" /><path d="M12 7v5l3.5 2" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" /></svg>
);
export const AtGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><circle cx="12" cy="12" r="3.6" fill="none" stroke={color} strokeWidth="2.4" /><path d="M15.6 12v1.6a2.6 2.6 0 0 0 5.2 0V12A8.8 8.8 0 1 0 17 19.3" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" /></svg>
);
export const GlobeGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.2" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke={color} strokeWidth="2" /></svg>
);
export const CalendarGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke={color} strokeWidth="2.4" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke={color} strokeWidth="2.4" strokeLinecap="round" /></svg>
);
/** Ícone neutro de imagem ausente. */
export const NoPhotoGlyph = ({ size, color, style }: G) => (
  <svg viewBox="0 0 24 24" style={base(size, style)} aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke={color} strokeWidth="1.8" /><circle cx="9" cy="10" r="1.8" fill={color} /><path d="m4 18 5.2-5 3.6 3.4 2.6-2.4L20 18" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" /></svg>
);
