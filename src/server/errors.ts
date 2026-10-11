// Erro de aplicação com mensagem em português pronta para o usuário.
export type ErrorCode =
  | "unauthenticated" | "forbidden" | "not_found" | "validation" | "conflict"
  | "limit_reached" | "rate_limited" | "external_service" | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401, forbidden: 403, not_found: 404, validation: 422, conflict: 409,
  limit_reached: 402, rate_limited: 429, external_service: 502, internal: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what = "Registro") => new AppError("not_found", `${what} não encontrado.`);
export const forbidden = (msg = "Você não tem permissão para esta ação.") => new AppError("forbidden", msg);
