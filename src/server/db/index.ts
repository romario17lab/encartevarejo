import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __evPool?: Pool; __evDb?: DB };

export function getPool(): Pool {
  if (!globalForDb.__evPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    globalForDb.__evPool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
  }
  return globalForDb.__evPool;
}

export function getDb(): DB {
  if (!globalForDb.__evDb) globalForDb.__evDb = drizzle(getPool(), { schema });
  return globalForDb.__evDb;
}

export { schema };
