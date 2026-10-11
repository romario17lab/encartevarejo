// Impressão digital dos preços de uma renderização. Calculada igual no servidor (exportação)
// e no navegador (página renderizada) para garantir que todas as peças usaram os MESMOS preços.
import type { RenderItem } from "@/domain/campaign";
import { offerFingerprint } from "@/domain/offer";

/** Hash não criptográfico (cyrb53), determinístico e síncrono — funciona no servidor e no cliente. */
export function stableHash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Impressão digital do conjunto de ofertas (id do item + mecânica/valores), na ordem dos itens. */
export function offersFingerprint(items: Array<Pick<RenderItem, "id" | "offer">>): string {
  return stableHash(items.map((i) => `${i.id}:${offerFingerprint(i.offer)}`).join("|"));
}
