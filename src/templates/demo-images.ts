// Ilustrações ORIGINAIS de demonstração (SVG plano, desenhadas para este projeto).
// Não representam produtos ou marcas reais. Proporções variadas (alta, larga, quadrada)
// para testar que as fotos NUNCA são distorcidas. Cada SVG traz <title> e o selo "demo".

const tag = (w: number, h: number) =>
  `<g opacity=".55"><rect x="${w - 46}" y="${h - 20}" width="42" height="16" rx="8" fill="#fff" stroke="#9ca3af"/><text x="${w - 25}" y="${h - 8.5}" font-family="Arial" font-size="10" font-weight="700" fill="#6b7280" text-anchor="middle">demo</text></g>`;

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><title>Ilustração de demonstração</title>${body}${tag(w, h)}</svg>`;

export const DEMO_SVGS: Record<string, string> = {
  // quadrada
  tomate: svg(240, 240, `<circle cx="120" cy="138" r="82" fill="#e2412b"/><ellipse cx="88" cy="110" rx="22" ry="14" fill="#f27a63" opacity=".7"/><path d="M120 62l14 18 22-8-12 18 20 10-24 2-20 14-20-14-24-2 20-10-12-18 22 8z" fill="#3f8f3a"/><rect x="116" y="44" width="8" height="24" rx="4" fill="#2f6b2b"/>`),
  // larga
  banana: svg(320, 180, `<path d="M30 70c40 70 170 90 260 20 8-6 18 0 12 10-70 80-230 80-284-14-4-8 8-24 12-16z" fill="#f4c430"/><path d="M40 80c50 50 150 60 230 18" stroke="#d9a514" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M284 74l18-14 6 8-16 14z" fill="#6b4f1d"/><path d="M26 60l-8 10 12 8z" fill="#6b4f1d"/>`),
  // larga
  pao: svg(320, 190, `<path d="M36 128c-10-60 60-92 124-92s134 32 124 92c-2 18-14 28-30 28H66c-16 0-28-10-30-28z" fill="#d08a3c"/><path d="M40 126c6 14 14 22 30 22h180c16 0 24-8 30-22" fill="#b06c25"/>${[90, 140, 190, 240].map((x) => `<path d="M${x - 14} 70q14-16 28 6" stroke="#f3c27f" stroke-width="9" fill="none" stroke-linecap="round"/>`).join("")}`),
  // alta
  garrafa: svg(200, 340, `<rect x="84" y="18" width="32" height="26" rx="6" fill="#1f5f99"/><path d="M80 44h40v40c0 14 34 28 34 64v156c0 12-10 20-22 20H68c-12 0-22-8-22-20V148c0-36 34-50 34-64z" fill="#7cc4ea"/><rect x="46" y="170" width="108" height="76" fill="#ffffff" opacity=".9"/><rect x="58" y="192" width="84" height="10" rx="5" fill="#1f5f99"/><rect x="58" y="212" width="60" height="8" rx="4" fill="#7cc4ea"/><path d="M62 100c-6 20-6 40-4 56" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".6"/>`),
  // larga
  carne: svg(300, 200, `<path d="M40 100c0-46 60-70 120-64 70 6 110 40 100 84-10 40-70 54-120 50-60-4-100-24-100-70z" fill="#c43b3b"/><path d="M60 100c10-30 60-48 104-42" stroke="#f3d1c7" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M150 130c30 0 60-8 80-26" stroke="#f3d1c7" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="200" cy="90" r="16" fill="#f7e6df"/><circle cx="200" cy="90" r="7" fill="#e7c3b6"/>`),
  // quadrada-ish
  caixa: svg(260, 240, `<path d="M30 80l100-40 100 40v110l-100 40-100-40z" fill="#c99b5f"/><path d="M30 80l100 40 100-40" fill="none" stroke="#a7783e" stroke-width="6"/><path d="M130 120v110" stroke="#a7783e" stroke-width="6"/><path d="M70 64l100 40v30l-20-8v-22L52 72z" fill="#e9c48f"/>`),
  // alta
  sacola: svg(220, 300, `<path d="M40 90h140l14 190H26z" fill="#2f9e6d"/><path d="M76 96V70a34 34 0 0 1 68 0v26" stroke="#1f6e4b" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="110" cy="180" r="34" fill="#ffffff" opacity=".85"/><path d="M96 180l10 10 18-22" stroke="#2f9e6d" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  // alta
  leite: svg(180, 320, `<path d="M40 70l20-40h60l20 40v230H40z" fill="#f4f6f8"/><path d="M60 30h60l-10 22H70z" fill="#d9dee5"/><path d="M40 70h100v230H40z" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/><path d="M40 180c30-20 70 20 100 0v120H40z" fill="#4f8fd6"/><rect x="58" y="96" width="64" height="12" rx="6" fill="#4f8fd6"/><rect x="58" y="118" width="40" height="8" rx="4" fill="#94a3b8"/>`),
  // quadrada
  queijo: svg(240, 220, `<path d="M20 150l170-90 30 30v80H20z" fill="#f7c948"/><path d="M20 150h200v20H20z" fill="#e3ad1f"/><circle cx="90" cy="140" r="12" fill="#e3ad1f"/><circle cx="150" cy="120" r="9" fill="#e3ad1f"/><circle cx="185" cy="150" r="14" fill="#e3ad1f"/>`),
  // larga
  biscoito: svg(320, 170, `<rect x="20" y="40" width="280" height="96" rx="20" fill="#7b4a2a"/><rect x="34" y="52" width="252" height="72" rx="14" fill="#a8693f"/>${[70, 120, 170, 220, 260].map((x) => `<circle cx="${x}" cy="88" r="6" fill="#5b3219"/>`).join("")}<rect x="20" y="80" width="280" height="14" fill="#f3e3cf"/>`),
  // quadrada
  maca: svg(230, 240, `<path d="M115 70c-40-26-96-6-96 60 0 60 40 100 70 100 14 0 18-8 26-8s12 8 26 8c30 0 70-40 70-100 0-66-56-86-96-60z" fill="#d6312f"/><path d="M115 70c0-20 4-34 14-46" stroke="#5a3a1a" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M122 46c20-18 44-14 54-6-16 14-38 18-54 6z" fill="#3f8f3a"/><ellipse cx="74" cy="112" rx="14" ry="24" fill="#f07a72" opacity=".6"/>`),
  // larga
  ovos: svg(320, 190, `<rect x="16" y="90" width="288" height="70" rx="14" fill="#c9b79c"/>${[60, 125, 190, 255].map((x) => `<ellipse cx="${x}" cy="88" rx="28" ry="36" fill="#f6efe3" stroke="#e2d6c1" stroke-width="3"/>`).join("")}<rect x="16" y="110" width="288" height="50" rx="12" fill="#b9a585"/>`),
};

export type DemoImageKey = keyof typeof DEMO_SVGS;

export function demoImageUrl(key: string): string | null {
  const s = DEMO_SVGS[key];
  return s ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}` : null;
}
