// Recria o banco de testes do zero (schema public + histórico de migrações) e aplica as migrações.
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/ev_be_test";
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  if (!/test/.test(dbName)) throw new Error(`Recuso limpar o banco "${dbName}": o nome do banco de testes precisa conter "test".`);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
  if (!exists.rowCount) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(c), { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  await c.end();
}
