import type { NextRequest } from "next/server";
import { AppError } from "../errors";

// Limite simples em memória (por processo). Suficiente para um único servidor web;
// com várias instâncias, troque por um contador no Postgres/Redis.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function clientIp(req?: Request | NextRequest | null): string {
  if (!req) return "local";
  // Cabeçalhos de IP só são confiáveis atrás de um proxy conhecido (TRUST_PROXY=1);
  // caso contrário qualquer cliente poderia forjá-los para escapar do limite.
  if (process.env.TRUST_PROXY !== "1") return "direct";
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",").at(-1)!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Conta uma tentativa; lança rate_limited se passar do limite na janela. */
export function hitRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    b.count++;
    if (b.count > limit) {
      const min = Math.max(1, Math.ceil((b.resetAt - now) / 60000));
      throw new AppError("rate_limited", `Muitas tentativas. Aguarde ${min} minuto${min > 1 ? "s" : ""} e tente novamente.`);
    }
  }
  if (buckets.size > 10000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function resetRateLimit(key: string): void { buckets.delete(key); }
export function clearAllRateLimits(): void { buckets.clear(); }
