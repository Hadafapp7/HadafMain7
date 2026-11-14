import path from "path";
import process from "process";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch (e) {
  try {
    process.loadEnvFile(path.join(process.cwd(), "artifacts/api-server/.env"));
  } catch (err) {}
}

import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}


import { pool } from "@workspace/db";

import { ensureSchema } from "./lib/schema-sync";

// Database connectivity check on boot (then bring the schema up to date)
pool.query("SELECT 1")
  .then(() => {
    logger.info("Database connection to Supabase verified successfully.");
    return ensureSchema();
  })
  .catch((err: any) => {
    if (err?.message?.includes("tenant") || err?.message?.includes("ENOTFOUND") || err?.code === "XX000") {
      console.warn("\n⚠️  [SUPABASE DATABASE PAUSED] ⚠️");
      console.warn("Could not connect to Supabase database: " + (err.message || err));
      console.warn("Your Supabase project appears to be PAUSED. Visit https://supabase.com/dashboard and click 'Restore project' to resume it.\n");
    } else {
      logger.warn({ err: err?.message || err }, "Database initial query check failed");
    }
  });

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
