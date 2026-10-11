// Dados dos testes de aceitação: produtos com todas as mecânicas, fotos reais geradas com sharp
// (uma muito larga e uma muito alta, com um círculo para revelar qualquer distorção) e nomes longos.
import sharp from "sharp";
import type { Account } from "./helpers";
import { campaign, product } from "./helpers";

/** Foto sintética: fundo em degradê + círculo perfeito + quadrado; distorção vira elipse/retângulo. */
export async function photo(w: number, h: number, color: string): Promise<Buffer> {
  const r = Math.min(w, h) * 0.4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff7e0"/><stop offset="1" stop-color="#ffe0b0"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="${color}" stroke="#222" stroke-width="${Math.max(2, r * 0.06)}"/>
    <rect x="${w / 2 - r * 0.35}" y="${h / 2 - r * 0.35}" width="${r * 0.7}" height="${r * 0.7}" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

export async function upload(a: Account, buf: Buffer, name: string) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), name);
  fd.append("source", "upload");
  const r = await a.api.req("POST", "/api/assets", undefined, { form: fd });
  if (r.status >= 300) throw new Error(`upload ${r.status} ${JSON.stringify(r.json)}`);
  return r.json as { id: string; width: number; height: number };
}

export const LONG_NAME = "Biscoito recheado sabor chocolate com avelã e cobertura crocante pacote família econômico tamanho grande";

type Offer = Record<string, unknown>;
export const MIXED: Array<{ name: string; unit: string; brand?: string; sizeLabel?: string; offer: Offer; img?: "wide" | "tall" | "sq" }> = [
  { name: "Picanha bovina", unit: "kg", offer: { mode: "from_to", priceCents: 5990, regularCents: 7990 }, img: "wide" },
  { name: "Banana prata", unit: "kg", offer: { mode: "simple", priceCents: 499 }, img: "tall" },
  { name: "Cerveja lata 350ml", unit: "lata", brand: "Marca Teste", offer: { mode: "combo", priceCents: null, comboQty: 3, comboCents: 1200, regularCents: 459 } },
  { name: "Arroz branco tipo 1", unit: "pct", sizeLabel: "5kg", offer: { mode: "min_qty", priceCents: 2290, minQty: 2, regularCents: 2490 }, img: "sq" },
  { name: "Café torrado e moído", unit: "pct", sizeLabel: "500g", offer: { mode: "club", priceCents: 1890, clubCents: 1590, clubName: "Clube Vantagens" } },
  { name: LONG_NAME, unit: "pct", offer: { mode: "simple", priceCents: 389, limitPerCustomer: 4 } },
  { name: "Queijo muçarela fatiado", unit: "100g", offer: { mode: "from_to", priceCents: 349, regularCents: 449, paymentNote: "no Pix" }, img: "wide" },
  { name: "Leite integral", unit: "l", offer: { mode: "simple", priceCents: 549 } },
  { name: "Detergente líquido 500ml", unit: "un", offer: { mode: "simple", priceCents: 229, conditions: "Válido para fragrâncias selecionadas" }, img: "tall" },
  { name: "Ovos brancos", unit: "dz", offer: { mode: "simple", priceCents: 1099 } },
  { name: "Refrigerante 2L", unit: "garrafa", offer: { mode: "from_to", priceCents: 799, regularCents: 999 } },
  { name: "Papel higiênico folha dupla 12 rolos", unit: "pct", offer: { mode: "simple", priceCents: 1999 } },
];

export async function buildCampaign(a: Account, n: number, opts: { name?: string; templateId?: string; withImages?: boolean } = {}) {
  const imgs: Record<string, string> = {};
  if (opts.withImages !== false) {
    imgs.wide = (await upload(a, await photo(1600, 400, "#d62828"), "larga.jpg")).id;
    imgs.tall = (await upload(a, await photo(300, 1200, "#2a9d8f"), "alta.jpg")).id;
    imgs.sq = (await upload(a, await photo(800, 800, "#e9c46a"), "quadrada.jpg")).id;
  }
  const ids: string[] = [];
  const specs = Array.from({ length: n }, (_, k) => {
    const base = MIXED[k % MIXED.length]!;
    return k < MIXED.length ? base : { ...base, name: `${base.name} ${Math.floor(k / MIXED.length) + 1}`.slice(0, 120), offer: { ...base.offer, priceCents: base.offer.priceCents == null ? null : (base.offer.priceCents as number) + k } };
  });
  for (const s of specs) ids.push((await product(a, { name: s.name, unit: s.unit, brand: s.brand ?? null, sizeLabel: s.sizeLabel ?? null, regularCents: 999 })).id);
  const st = await campaign(a, ids, { name: opts.name ?? `QA ${n} produtos`, templateId: opts.templateId ?? "feira-da-semana" });
  const items = st.items.map((it: any, k: number) => ({ ...it, offer: { ...it.offer, ...specs[k]!.offer }, imageAssetId: specs[k]!.img ? imgs[specs[k]!.img!] ?? null : it.imageAssetId, highlight: k === 0 }));
  const saved = await a.api.put(`/api/campaigns/${st.campaign.id}`, { baseVersion: st.campaign.version, items });
  if (saved.status !== 200) throw new Error(`save ${saved.status} ${JSON.stringify(saved.json).slice(0, 800)}`);
  return { id: st.campaign.id as string, state: saved.json, imgs };
}
