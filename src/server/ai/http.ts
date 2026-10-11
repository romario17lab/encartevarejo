import { AppError } from "../errors";

// Transporte HTTP dos provedores de IA: tempo limite, novas tentativas em 429/5xx/erro de rede com espera
// crescente (respeitando retry-after) e erros em português. Nunca registra chaves nem o conteúdo enviado.

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

let transport: FetchLike | null = null;

/** Só para testes: troca o fetch usado pelos provedores (provedor HTTP falso). Sem argumento, volta ao fetch global. */
export function setAiTransport(f: FetchLike | null = null) { transport = f; }

function currentFetch(): FetchLike {
  return transport ?? ((url, init) => fetch(url, init));
}

/** Serviço de IA não configurado neste ambiente (HTTP 503, código "ai_not_configured"). */
export class AiNotConfiguredError extends AppError {
  constructor(what = "A IA assistida") {
    super("external_service", `${what} não está configurada neste ambiente. Use o caminho manual ou peça ao administrador para configurar a integração.`);
    (this as unknown as { code: string }).code = "ai_not_configured";
    (this as unknown as { status: number }).status = 503;
  }
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SendOpts {
  /** nome do serviço para mensagens ("A IA", "A remoção de fundo") */
  service: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
}

/** Resposta HTTP com status de erro final (depois das novas tentativas). */
export class ProviderHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) { super(`HTTP ${status}`); }
}

function retryAfterMs(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.min(Math.max(s * 1000, 0), 10_000);
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.min(Math.max(d - Date.now(), 0), 10_000) : null;
}

/**
 * Envia a requisição com tempo limite e novas tentativas. Devolve a resposta 2xx;
 * lança ProviderHttpError para respostas de erro e AppError para tempo esgotado/rede.
 * `build` cria um RequestInit novo a cada tentativa (corpos multipart não podem ser reaproveitados).
 */
export async function sendWithRetry(url: string, build: () => RequestInit, opts: SendOpts): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = lastErr instanceof Response ? retryAfterMs(lastErr) : null;
      const backoff = opts.retryBaseMs * 2 ** (attempt - 1);
      await sleep(wait ?? backoff + Math.floor(Math.random() * opts.retryBaseMs * 0.25));
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    try {
      const res = await currentFetch()(url, { ...build(), signal: ac.signal });
      if (res.ok) return res;
      if (RETRYABLE.has(res.status) && attempt < opts.maxRetries) { lastErr = res; await res.body?.cancel().catch(() => {}); continue; }
      throw new ProviderHttpError(res.status, await res.text().catch(() => ""));
    } catch (e) {
      if (e instanceof ProviderHttpError) throw e;
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError";
      if (attempt < opts.maxRetries) continue;
      console.warn(`[ia] ${opts.service}: ${aborted ? "tempo esgotado" : "falha de rede"} após ${attempt + 1} tentativa(s).`);
      throw new AppError("external_service", aborted
        ? `${opts.service} demorou demais para responder. Tente de novo em instantes.`
        : `Não foi possível falar com ${opts.service.toLowerCase()}. Verifique a conexão do servidor e tente de novo.`);
    } finally { clearTimeout(timer); }
  }
  // inalcançável: o laço sempre devolve ou lança
  throw new AppError("external_service", `${opts.service} não respondeu.`);
}

/** Converte o status final de um provedor em erro em português (sem expor o corpo da resposta). */
export function providerError(service: string, status: number): AppError {
  console.warn(`[ia] ${service}: resposta HTTP ${status}.`);
  if (status === 401 || status === 403) return new AppError("external_service", `${service} recusou a chave de acesso configurada. Avise o administrador da plataforma.`);
  if (status === 402) return new AppError("external_service", `${service} está sem créditos no provedor. Avise o administrador da plataforma.`);
  if (status === 429 || status === 529) return new AppError("rate_limited", `${service} está ocupada no momento. Aguarde um minuto e tente de novo.`);
  if (status === 413) return new AppError("validation", "O arquivo é grande demais para o serviço de IA. Envie um arquivo menor.");
  if (status >= 500) return new AppError("external_service", `${service} está indisponível no momento. Tente de novo em instantes.`);
  return new AppError("external_service", `${service} não aceitou o pedido (código ${status}). Tente de novo ou use o caminho manual.`);
}
