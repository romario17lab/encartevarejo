import { AppError } from "../errors";
import { aiConfig, SERVER_FALLBACK_MODELS } from "./config";
import { AiNotConfiguredError, ProviderHttpError, providerError, sendWithRetry } from "./http";

// Cliente mínimo da Messages API da Anthropic (HTTP direto, sem SDK).
// Saída sempre em JSON validado por esquema (output_config.format). Nada do conteúdo é registrado em log.

export type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export interface ClaudeJsonRequest {
  system: string;
  content: ClaudeBlock[];
  /** JSON Schema da resposta (objetos com additionalProperties:false e todos os campos em required) */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface ClaudeJsonResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const SERVICE = "A IA";

interface MessagesResponse {
  model?: string;
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function claudeJson<T>(req: ClaudeJsonRequest): Promise<ClaudeJsonResult<T>> {
  const cfg = aiConfig();
  if (!cfg.anthropicKey) throw new AiNotConfiguredError();
  const fallback = cfg.serverFallback && SERVER_FALLBACK_MODELS.has(cfg.model);
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: [{ role: "user", content: req.content }],
    output_config: { effort: cfg.effort, format: { type: "json_schema", schema: req.schema } },
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": cfg.anthropicKey,
    "anthropic-version": "2023-06-01",
  };
  if (fallback) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; }
  const payload = JSON.stringify(body);

  let res: Response;
  try {
    res = await sendWithRetry(`${cfg.anthropicBaseUrl}/v1/messages`, () => ({ method: "POST", headers, body: payload }),
      { service: SERVICE, timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries, retryBaseMs: cfg.retryBaseMs });
  } catch (e) {
    if (e instanceof ProviderHttpError) throw providerError(SERVICE, e.status);
    throw e;
  }
  let json: MessagesResponse;
  try { json = (await res.json()) as MessagesResponse; } catch { throw new AppError("external_service", "A IA devolveu uma resposta ilegível. Tente de novo."); }

  if (json.stop_reason === "refusal") throw new AppError("external_service", "A IA recusou este pedido. Revise o conteúdo enviado ou use o caminho manual.");
  if (json.stop_reason === "max_tokens") throw new AppError("validation", "O conteúdo é grande demais para uma única leitura. Divida a lista em partes menores.");
  const text = (json.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new AppError("external_service", "A IA devolveu uma resposta fora do formato esperado. Tente de novo."); }
  return {
    data,
    model: json.model ?? cfg.model,
    usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
  };
}

// ---------- Ajudantes de esquema JSON ----------
export const S = {
  str: () => ({ type: "string" }),
  nullableStr: () => ({ anyOf: [{ type: "string" }, { type: "null" }] }),
  int: () => ({ type: "integer" }),
  enumOf: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
  arr: (items: Record<string, unknown>) => ({ type: "array", items }),
  obj: (props: Record<string, Record<string, unknown>>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false }),
};
