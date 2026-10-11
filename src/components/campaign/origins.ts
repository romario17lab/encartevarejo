// Origens dos links de campanha (?origem=). Mesmo formato normalizado que a vitrine grava
// (normalizeSource em src/server/services/storefront.ts): minúsculas, sem acento, [a-z0-9_.-], até 40 caracteres.

export const ORIGIN_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "qr", label: "Cartaz / QR code" },
  { value: "outro", label: "Outro" },
] as const;
export type OriginOption = (typeof ORIGIN_OPTIONS)[number]["value"];

const KNOWN_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", qr: "Cartaz / QR code",
  tiktok: "TikTok", google: "Google", email: "E-mail", sms: "SMS", encarte: "Encarte impresso",
};

export function normalizeOrigin(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || null;
}

/** Nome amigável da origem gravada (null = acesso direto, sem origem no link). */
export function originLabel(source: string | null): string {
  if (!source) return "Direto (sem origem no link)";
  return KNOWN_LABELS[source] ?? source;
}

/** Endereço público da vitrine; com campanha e origem quando informados. */
export function storefrontLink(storefrontBase: string, slug: string, opts: { campaignId?: string | null; origin?: string | null } = {}): string {
  const url = `${storefrontBase.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
  const params = new URLSearchParams();
  if (opts.campaignId) params.set("campanha", opts.campaignId);
  const o = normalizeOrigin(opts.origin);
  if (o) params.set("origem", o);
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}
