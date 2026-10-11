import { signToken, verifyToken } from "./signing";

/**
 * URL assinada e com validade para uma imagem/arquivo privado da conta.
 * Usada na renderização/exportação (Chromium) e na vitrine pública.
 * Retorna caminho relativo (mesma origem da aplicação).
 */
export function signedAssetUrl(assetId: string, orgId: string, ttlSec: number): string {
  const t = signToken({ aid: assetId, org: orgId }, ttlSec);
  return `/api/assets/${encodeURIComponent(assetId)}?t=${encodeURIComponent(t)}`;
}

/** Valida o token de uma URL assinada para o asset informado. Retorna o orgId do token ou null. */
export function verifyAssetToken(token: string | null | undefined, assetId: string): string | null {
  const data = verifyToken<{ aid: string; org: string }>(token);
  if (!data || data.aid !== assetId || typeof data.org !== "string") return null;
  return data.org;
}
