import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      ssl: config.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const db = drizzle(pool);
  // Resolve migrations from project root (server/migrations) when run via tsx or node from server/
  const migrationsFolder = path.join(process.cwd(), "migrations");
  await migrate(db, { migrationsFolder });
}

export async function ping(): Promise<boolean> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

export * from "./schema.js";
