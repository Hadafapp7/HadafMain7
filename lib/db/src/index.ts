import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

import path from "path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  const paths = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "artifacts/api-server/.env"),
    path.join(process.cwd(), "../../artifacts/api-server/.env"),
  ];
  for (const p of paths) {
    try {
      process.loadEnvFile(p);
      if (process.env.DATABASE_URL) {
        console.log(`[Database] Loaded environment variables from: ${p}`);
        break;
      }
    } catch {}
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
