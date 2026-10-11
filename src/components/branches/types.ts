import type { Store } from "@/lib/client/api";

export interface BranchStore extends Store { slug: string; brandKitName: string | null; priceOverrides: number }
export interface BranchKit { id: string; name: string; isDefault: boolean; storeCount: number }
export interface StoresOverview {
  stores: BranchStore[];
  brandKits: BranchKit[];
  plan: { id: string; name: string; storeLimit: number; storesUsed: number; branchesFeature: boolean };
  restricted: boolean;
}

export function addressText(a: Store["address"] | undefined) {
  if (!a) return "";
  const l1 = [a.street, a.number].filter(Boolean).join(", ");
  const l2 = [a.district, [a.city, a.state].filter(Boolean).join("/")].filter(Boolean).join(" – ");
  return [l1, l2].filter(Boolean).join(" · ");
}

export const fmtWhats = (d: string | null | undefined) => {
  if (!d) return "";
  const m = d.replace(/^55/, "").match(/^(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
};
