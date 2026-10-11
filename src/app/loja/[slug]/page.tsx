import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getStorefront, recordStorefrontEvent } from "@/server/services/storefront";
import { buildValidityText, formatAddressLine, formatHoursLine, formatPhoneBR } from "@/server/services/render-data";
import { appUrl } from "@/server/email";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";
import { contrastRatio } from "@/lib/client/color";
import { StorefrontView, type StorefrontViewData } from "@/components/storefront/StorefrontView";

// Vitrine pública da loja (endereço impresso em todas as peças: APP_URL/loja/<slug>).
// Mostra somente o instantâneo publicado e dentro da validade (getStorefront). Nunca mostra custo.
export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** Cor de texto legível sobre um fundo (branco ou quase preto). */
function onColor(bg: string): string {
  const w = contrastRatio("#ffffff", bg) ?? 21;
  const k = contrastRatio("#111827", bg) ?? 1;
  return w >= k ? "#ffffff" : "#111827";
}
/** Usa a cor da marca como cor de texto sobre branco só se tiver contraste AA (4,5:1). */
function readableOnWhite(c: string, fallback = "#111827"): string {
  return (contrastRatio(c, "#ffffff") ?? 0) >= 4.5 ? c : fallback;
}
const safeHex = (v: string | undefined, fb: string) => (v && /^#[0-9a-fA-F]{3,6}$/.test(v.trim()) ? v.trim() : fb);

/** Telefone para wa.me: só dígitos, com DDI 55. */
function waNumber(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const sf = await getStorefront(slug);
  if (!sf) return { title: "Loja não encontrada", robots: { index: false } };
  const count = sf.campaigns.reduce((n, c) => n + c.items.length, 0);
  const title = `Ofertas ${sf.store.name}`;
  const city = sf.store.address?.city ? ` em ${sf.store.address.city}` : "";
  const description = count
    ? `${count} ${count === 1 ? "oferta válida" : "ofertas válidas"} no ${sf.store.name}${city}. Veja os preços e monte sua lista de interesse para enviar pelo WhatsApp.`
    : `Ofertas do ${sf.store.name}${city}. Nenhuma oferta ativa no momento.`;
  const url = appUrl(`/loja/${sf.store.slug}`);
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "pt_BR", url, title, description, siteName: sf.store.name },
    twitter: { card: "summary", title, description },
    robots: sf.isDemo ? { index: false, follow: false } : undefined,
  };
}

export default async function LojaPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const sf = await getStorefront(slug);
  if (!sf) notFound();

  const source = first(sp.utm_source) ?? first(sp.origem);
  // contagem de visualizações: limite leve por IP+loja; nunca impede a página de abrir
  try {
    const h = await headers();
    hitRateLimit(`sf-view:${clientIp({ headers: h } as unknown as Request)}:${slug}`, 120, 60 * 1000);
    await recordStorefrontEvent(slug, "view", { source, campaignId: sf.campaigns.length === 1 ? sf.campaigns[0]!.id : null });
  } catch { /* limite atingido ou falha de registro: a vitrine continua */ }

  const pageUrl = appUrl(`/loja/${sf.store.slug}`);
  const qrSvg = await QRCode.toString(pageUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } });

  const c = sf.brand.colors;
  const primary = safeHex(c?.primary, "#166534");
  const accent = safeHex(c?.accent, "#dc2626");
  const data: StorefrontViewData = {
    slug: sf.store.slug,
    source,
    pageUrl,
    isDemo: sf.isDemo,
    store: {
      name: sf.store.name,
      logoUrl: sf.brand.logoUrl,
      slogan: sf.brand.slogan,
      address: formatAddressLine(sf.store.address),
      hours: formatHoursLine(sf.store.hours, sf.store.hoursNote),
      phone: formatPhoneBR(sf.store.phone),
      phoneDigits: sf.store.phone ? sf.store.phone.replace(/\D/g, "") : null,
      whatsapp: formatPhoneBR(sf.store.whatsapp),
      whatsappNumber: waNumber(sf.store.whatsapp),
      legalText: sf.brand.legalText,
    },
    colors: { primary, onPrimary: onColor(primary), price: readableOnWhite(accent, readableOnWhite(primary)) },
    campaigns: sf.campaigns.map((cp) => ({
      id: cp.id,
      title: cp.title,
      subtitle: cp.subtitle,
      validity: buildValidityText(new Date(cp.startsAt), new Date(cp.endsAt), cp.validityNote),
      items: cp.items.map((i) => ({
        id: i.id, name: i.name, brand: i.brand, sizeLabel: i.sizeLabel, unit: i.unit, category: i.category?.trim() || null,
        imageUrl: i.imageUrl, offer: i.offer, offerText: i.offerText, highlight: i.highlight,
      })),
    })),
  };

  return <StorefrontView data={data} qrSvg={qrSvg} />;
}
