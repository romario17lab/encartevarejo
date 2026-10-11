import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "./index";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrações aplicadas.");
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
