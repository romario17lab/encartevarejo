// Configuração da IA assistida. Tudo vem de variáveis de ambiente do servidor; nada aqui vai ao navegador.
// Sem ANTHROPIC_API_KEY os recursos de texto/visão aparecem como "não configurado" e o caminho manual continua.
// Sem REMOVEBG_API_KEY a remoção de fundo aparece como "não configurada".

export type AiKind = "extrair_lista" | "remover_fundo" | "sugerir_textos" | "sugerir_campanha" | "organizar_produtos";

/** Modelo padrão (Claude Sonnet 5.5). Troque com AI_MODEL. */
export const DEFAULT_AI_MODEL = "claude-sonnet-5-5";

/** Créditos padrão por tipo de pedido. Ajuste com AI_CREDITS (JSON), ex.: {"extrair_lista_imagem":3}. */
export const DEFAULT_CREDITS = {
  extrair_lista_texto: 1,
  extrair_lista_imagem: 2,
  extrair_lista_pdf: 3,
  remover_fundo: 1,
  sugerir_textos: 1,
  sugerir_campanha: 1,
  organizar_produtos: 1,
} as const;
export type CreditKey = keyof typeof DEFAULT_CREDITS;

export interface AiConfig {
  anthropicKey: string | null;
  anthropicBaseUrl: string;
  model: string;
  effort: "low" | "medium" | "high";
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  /** fallbacks:"default" do servidor (recusa por classificador de segurança é refeita em outro modelo) */
  serverFallback: boolean;
  removeBgKey: string | null;
  removeBgUrl: string;
  credits: Record<CreditKey, number>;
  /** pedidos de IA por conta por minuto */
  ratePerMinute: number;
}

let overrides: Partial<AiConfig> = {};

/** Só para testes: substitui valores da configuração. Chame sem argumento para limpar. */
export function configureAi(o: Partial<AiConfig> = {}) { overrides = o; }

function int(v: string | undefined, def: number, min: number, max: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : def;
}

function parseCredits(raw: string | undefined): Record<CreditKey, number> {
  const out: Record<CreditKey, number> = { ...DEFAULT_CREDITS };
  if (!raw) return out;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_CREDITS) as CreditKey[]) {
      const v = obj[k];
      if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 1000) out[k] = v;
    }
  } catch { /* JSON inválido: mantém os padrões */ }
  return out;
}

export function aiConfig(): AiConfig {
  const env = process.env;
  const effort = env.AI_EFFORT === "low" || env.AI_EFFORT === "high" ? env.AI_EFFORT : "medium";
  const base: AiConfig = {
    anthropicKey: env.ANTHROPIC_API_KEY?.trim() || null,
    anthropicBaseUrl: (env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/+$/, ""),
    model: env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
    effort,
    timeoutMs: int(env.AI_TIMEOUT_MS, 90_000, 5_000, 600_000),
    maxRetries: int(env.AI_MAX_RETRIES, 2, 0, 5),
    retryBaseMs: 800,
    serverFallback: env.AI_SERVER_FALLBACK !== "0",
    removeBgKey: env.REMOVEBG_API_KEY?.trim() || null,
    removeBgUrl: env.REMOVEBG_URL?.trim() || "https://api.remove.bg/v1.0/removebg",
    credits: parseCredits(env.AI_CREDITS),
    ratePerMinute: int(env.AI_RATE_PER_MINUTE, 20, 1, 1000),
  };
  return { ...base, ...overrides, credits: { ...base.credits, ...(overrides.credits ?? {}) } };
}

export function llmConfigured() { return !!aiConfig().anthropicKey; }
export function backgroundRemovalConfigured() { return !!aiConfig().removeBgKey; }

/** Modelos que aceitam fallbacks:"default" (Claude API). Outros modelos seguem sem o parâmetro. */
export const SERVER_FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);
