"use client";
import { api, asList, type Product } from "./api";

/** Carrega o catálogo inteiro (segue o cursor; limite de segurança de 50 páginas). */
export async function fetchAllProducts(): Promise<Product[]> {
  const out: Product[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const res: unknown = await api.get(`/api/products${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    out.push(...asList<Product>(res, "products"));
    cursor = !Array.isArray(res) && res && typeof res === "object" ? ((res as { nextCursor?: string | null }).nextCursor ?? null) : null;
    if (!cursor) break;
  }
  return out;
}

export const normalizeName = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
