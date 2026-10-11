"use client";
// Cliente HTTP tipado da interface. Toda chamada à API passa por aqui.
// - Erros da API chegam como { error: { code, message } } e viram ApiError com a mensagem em português.
// - 401 (sessão ausente/expirada) redireciona para /entrar?voltar=<página atual>.
import type { CampaignItem, CampaignStatus, PieceOverrides, Permission, RenderCampaign, Role } from "@/domain/campaign";
import type { FormatId } from "@/domain/formats";
import type { Unit } from "@/domain/offer";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; noAuthRedirect?: boolean; signal?: AbortSignal };

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (/^\/(entrar|cadastro|esqueci-senha|redefinir-senha|convite)/.test(window.location.pathname)) return;
  window.location.assign(`/entrar?voltar=${encodeURIComponent(here)}`);
}

export async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"), credentials: "same-origin", signal: opts.signal, headers: {} };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "network", "Sem conexão com o servidor. Verifique sua internet e tente de novo.");
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && !opts.noAuthRedirect) redirectToLogin();
    const fallback = res.status === 404 ? "Não encontrado." : res.status >= 500 ? "Erro no servidor. Tente novamente em instantes." : "Não foi possível concluir a ação.";
    throw new ApiError(res.status, err?.code ?? String(res.status), err?.message ?? fallback, err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string, o?: Opts) => request<T>(p, { ...o, method: "GET" }),
  post: <T>(p: string, body?: unknown, o?: Opts) => request<T>(p, { ...o, method: "POST", body: body ?? {} }),
  put: <T>(p: string, body?: unknown, o?: Opts) => request<T>(p, { ...o, method: "PUT", body }),
  patch: <T>(p: string, body?: unknown, o?: Opts) => request<T>(p, { ...o, method: "PATCH", body }),
  del: <T>(p: string, body?: unknown, o?: Opts) => request<T>(p, { ...o, method: "DELETE", body }),
  upload: <T>(p: string, form: FormData, o?: Opts) => request<T>(p, { ...o, method: "POST", form }),
};

/** Aceita lista pura ou envelopes comuns ({ items }, { data }, { <chave> }). */
export function asList<T>(v: unknown, ...keys: string[]): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    for (const k of [...keys, "items", "data", "rows", "results"]) {
      const x = (v as Record<string, unknown>)[k];
      if (Array.isArray(x)) return x as T[];
    }
  }
  return [];
}

export const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const assetUrl = (id: string | null | undefined) => (id ? `/api/assets/${id}` : null);

// ---------------- Tipos das respostas ----------------
export interface StoreSummary { id: string; name: string; slug?: string; segment?: string; brandKitId?: string }
export interface Me {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; isDemo?: boolean; settings?: { minMarginBp?: number | null; requireApproval?: boolean }; plan?: { id: string; name: string } } ;
  role: Role;
  orgs: Array<{ id: string; name: string; role: Role }>;
  stores: StoreSummary[];
  permissions: Permission[];
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sizeLabel: string | null;
  unit: Unit | null;
  barcode: string | null;
  imageAssetId: string | null;
  imageUrl?: string | null;
  regularCents: number | null;
  promoCents: number | null;
  costCents?: number | null;
  conditions: string | null;
  archivedAt?: string | null;
  updatedAt?: string;
  issues?: string[];
}
export type ProductInput = Partial<Omit<Product, "id" | "archivedAt" | "updatedAt" | "issues" | "imageUrl">> & { name: string };

export interface Asset { id: string; url: string; width: number; height: number }

export interface Address { street?: string; number?: string; district?: string; city?: string; state?: string; zip?: string; complement?: string }
export interface Store extends StoreSummary {
  brandKitId: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: Address;
  socials: { instagram?: string; facebook?: string; tiktok?: string; website?: string };
  hours: Record<string, string | null>;
  hoursNote: string | null;
  storefrontEnabled?: boolean;
}
export interface BrandColors { primary: string; secondary: string; accent: string; text: string; background: string }
export interface BrandKit { id: string; name: string; logoAssetId: string | null; logoUrl?: string | null; colors: BrandColors; slogan: string | null; legalText: string | null }

export interface Member { userId: string; name: string; email: string; role: Role; storeIds: string[] | null; createdAt?: string; isYou?: boolean }
export interface Invitation { id: string; email: string; role: Role; expiresAt: string; createdAt?: string; acceptedAt?: string | null; revokedAt?: string | null; status?: "pendente" | "aceito" | "cancelado" | "expirado" }

export interface CampaignSummary {
  id: string; name: string; title?: string; status: CampaignStatus; storeId: string; storeName?: string;
  startsAt: string | null; endsAt: string | null; updatedAt: string; createdAt?: string; itemCount?: number;
  templateId?: string; templateVersion?: number;
}

export interface CampaignCore {
  id: string; name: string; title: string; subtitle: string | null; status: CampaignStatus; storeId: string;
  startsAt: string | null; endsAt: string | null; validityNote: string | null;
  templateId: string; templateVersion: number; version: number;
  contentHash?: string; approvedVersion?: number | null; approvedHash?: string | null; approvedAt?: string | null;
  publishedVersion?: number | null; scheduledPublishAt?: string | null; overrides: PieceOverrides; updatedAt?: string; needsReapproval?: boolean;
}
export interface Piece { format: FormatId; enabled: boolean; overrides: PieceOverrides }
export interface EditorIssue { level: "error" | "warning"; message: string; itemId?: string; field?: string; code?: string }
export interface EditorState {
  campaign: CampaignCore;
  items: CampaignItem[];
  pieces: Piece[];
  template: { id: string; version: number; name: string; latestVersion: number };
  issues: EditorIssue[];
  store: Store | StoreSummary;
}

export interface TemplateMeta {
  id: string; version: number; name: string; description?: string; segments?: string[]; style?: string;
  supportedFormats?: FormatId[]; thumbnailFormat?: FormatId; latestVersion?: number; versions?: number[];
}

export interface CampaignVersion { version: number; reason: string | null; createdAt: string; createdBy?: string | null; createdByName?: string | null; contentHash?: string }

export interface ExportResultInfo { path: string; format: string; fileType: string; widthPx?: number; heightPx?: number; widthMm?: number; heightMm?: number; dpi?: number; pages?: number; bytes: number }
export interface ExportJob {
  id: string; status: "na_fila" | "processando" | "concluida" | "falhou"; error: string | null;
  resultInfo: ExportResultInfo[] | null; warnings: string[] | null; createdAt: string; finishedAt?: string | null;
  campaignVersion?: number; request?: { kind: "single" | "package"; items: Array<{ format: string; fileType: string }>; bleed?: boolean };
  downloadUrl?: string | null; fileName?: string | null; statusLabel?: string;
}

export interface ImportPreview {
  importId: string; columns: string[]; sampleRows: Array<Record<string, unknown> | unknown[]>;
  suggestedMapping: Record<string, string | null>; totalRows: number;
  rowsPreview?: Array<{ row: number; values: Record<string, unknown>; errors?: string[]; duplicateOf?: string | null }>;
}
export interface ImportResult { created: number; updated: number; skipped: number; errors: Array<{ row: number; message: string }> }

export interface ParsedRow { line: number; raw?: string; name: string | null; sizeLabel: string | null; unit: Unit | null; suggestedUnit?: Unit | null; priceCents: number | null; regularCents?: number | null; issues: string[] }

export interface BulkPriceChange { productId: string; regularCents?: number | null; promoCents?: number | null }
export interface BulkPriceDiffRow {
  productId: string; name: string;
  oldRegularCents: number | null; newRegularCents: number | null;
  oldPromoCents: number | null; newPromoCents: number | null;
  warnings?: string[];
}

/** POST /api/campaigns/:id/duplicate */
export interface DuplicateResult { campaigns?: Array<{ id: string; storeId: string; storeName: string; name: string }>; id?: string; campaign?: { id: string } }
export const duplicatedId = (r: DuplicateResult) => r.campaigns?.[0]?.id ?? r.id ?? r.campaign?.id ?? null;

export interface DuplicateGroup { key?: string; reason?: string; products: Product[] }

export type { Role, Permission, CampaignStatus, CampaignItem, PieceOverrides, RenderCampaign, FormatId, Unit };
