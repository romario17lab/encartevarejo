import type { DB } from "./index";

/** Transação do Drizzle (mesma API de consulta do DB). */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Qualquer executor: conexão do pool ou transação aberta. */
export type Executor = DB | Tx;
