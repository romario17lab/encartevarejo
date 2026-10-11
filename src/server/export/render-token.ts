import { signToken, verifyToken } from "@/server/signing";

export interface RenderTokenPayload { cid: string; org: string; v: number }

/** Token da página de renderização (/render/:campaignId?t=...). Sem sessão: o Chromium abre esta URL. */
export function signRenderToken(p: RenderTokenPayload, ttlSec = 900): string {
  return signToken({ cid: p.cid, org: p.org, v: p.v, k: "render" }, ttlSec);
}

export function verifyRenderToken(token: string | null | undefined): RenderTokenPayload | null {
  const d = verifyToken<{ cid: unknown; org: unknown; v: unknown; k: unknown }>(token);
  if (!d || d.k !== "render" || typeof d.cid !== "string" || typeof d.org !== "string" || typeof d.v !== "number") return null;
  return { cid: d.cid, org: d.org, v: d.v };
}

export function renderPath(p: { campaignId: string; format: string; page: number | "all"; version: number; token: string; bleed?: boolean }): string {
  const q = new URLSearchParams({ f: p.format, p: String(p.page), v: String(p.version), t: p.token });
  if (p.bleed) q.set("bleed", "1");
  return `/render/${encodeURIComponent(p.campaignId)}?${q.toString()}`;
}
