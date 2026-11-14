import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent, additive schema fix-ups that run on every boot.
 *
 * The production database was created before some columns were added to the Drizzle
 * schema. Because Drizzle selects EVERY column listed in the schema, a single missing
 * column makes `SELECT * FROM goals` / `INSERT ... RETURNING` fail with a 500 — which
 * is exactly why goals could not be listed or created. Each statement below only ever
 * ADDS something (`IF NOT EXISTS`), so it is safe to run repeatedly and in parallel
 * across several ECS tasks.
 */
const STATEMENTS: string[] = [
  // goals
  `ALTER TABLE goals ADD COLUMN IF NOT EXISTS forfeit_reason text`,
  `ALTER TABLE goals ADD COLUMN IF NOT EXISTS forfeit_roast text`,
  `ALTER TABLE goals ADD COLUMN IF NOT EXISTS block_apps boolean NOT NULL DEFAULT false`,
  // focus sessions
  `ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS forfeit_reason text`,
  `ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS forfeit_roast text`,
  // users
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS best_streak integer NOT NULL DEFAULT 0`,
  // notifications history
  `CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    type text NOT NULL DEFAULT 'guilt',
    trigger text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    metadata jsonb,
    sent_at timestamptz NOT NULL DEFAULT now()
  )`,
];

let done: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (done) return done;
  done = (async () => {
    let failed = false;
    for (const statement of STATEMENTS) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err: any) {
        failed = true;
        // Never crash the API over a migration problem, but make it very visible.
        logger.error({ statement, err: err?.message ?? err }, "[schema-sync] statement failed");
      }
    }
    if (failed) {
      // Let the next request / boot retry (e.g. the database was still waking up).
      done = null;
    } else {
      logger.info("[schema-sync] schema is up to date");
    }
  })();
  return done;
}
