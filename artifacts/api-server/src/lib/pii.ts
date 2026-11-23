import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const PII_PREFIX = "pgenc:";

/**
 * Encryption passphrase used with PostgreSQL's built-in `pgcrypto` extension
 * (`pgp_sym_encrypt` / `pgp_sym_decrypt`), so encrypted PII can also be decrypted
 * directly inside the Supabase SQL Editor using the same key.
 */
export function getPiiEncryptionKey(): string {
  return (
    process.env.PII_ENCRYPTION_KEY?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    "hadaf-pii-encryption-key-v1"
  );
}

export function isEncryptedPii(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PII_PREFIX);
}

/** Encrypts a single PII string using PostgreSQL `pgp_sym_encrypt` -> `pgenc:<base64>`. */
export async function encryptPiiValue(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isEncryptedPii(trimmed)) return trimmed;

  const key = getPiiEncryptionKey();
  try {
    const result: any = await db.execute(
      sql`SELECT replace(encode(pgp_sym_encrypt(${trimmed}, ${key}), 'base64'), E'\n', '') AS enc`
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    if (row?.enc) {
      return `${PII_PREFIX}${row.enc}`;
    }
  } catch (err: any) {
    console.warn("[PII] pgcrypto encrypt failed (trying extensions schema):", err?.message ?? err);
    try {
      const result: any = await db.execute(
        sql`SELECT replace(encode(extensions.pgp_sym_encrypt(${trimmed}, ${key}), 'base64'), E'\n', '') AS enc`
      );
      const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
      if (row?.enc) {
        return `${PII_PREFIX}${row.enc}`;
      }
    } catch (err2: any) {
      console.error("[PII] extensions.pgp_sym_encrypt failed:", err2?.message ?? err2);
    }
  }
  return trimmed;
}

/** Decrypts a single `pgenc:<base64>` PII string using PostgreSQL `pgp_sym_decrypt`. Passes legacy plaintext through unchanged. */
export async function decryptPiiValue(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null;
  if (!isEncryptedPii(value)) return value;

  const b64 = value.slice(PII_PREFIX.length);
  const key = getPiiEncryptionKey();
  try {
    const result: any = await db.execute(
      sql`SELECT pgp_sym_decrypt(decode(${b64}, 'base64'), ${key}) AS dec`
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    if (typeof row?.dec === "string") {
      return row.dec;
    }
  } catch (err: any) {
    try {
      const result: any = await db.execute(
        sql`SELECT extensions.pgp_sym_decrypt(decode(${b64}, 'base64'), ${key}) AS dec`
      );
      const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
      if (typeof row?.dec === "string") {
        return row.dec;
      }
    } catch (err2: any) {
      console.warn("[PII] pgcrypto decrypt failed:", err2?.message ?? err?.message ?? err);
    }
  }
  return value;
}

export interface PiiFields {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  gender?: string | null;
  age?: string | null;
}

/** Encrypts all present PII fields in one parallel batch before writing to Supabase. */
export async function encryptUserPiiFields<T extends PiiFields>(fields: T): Promise<T> {
  const out = { ...fields };
  const keys: (keyof PiiFields)[] = ["email", "name", "phone", "gender", "age"];
  await Promise.all(
    keys.map(async (k) => {
      if (k in fields && fields[k] !== undefined) {
        out[k] = (await encryptPiiValue(fields[k])) as any;
      }
    }),
  );
  return out;
}

/** Decrypts all present PII fields on a user record read from Supabase (safe for legacy plaintext rows). */
export async function decryptUserPii<T extends PiiFields>(user: T | null | undefined): Promise<T> {
  if (!user) return user as unknown as T;
  const out = { ...user };
  const keys: (keyof PiiFields)[] = ["email", "name", "phone", "gender", "age"];
  const needsDecrypt = keys.some((k) => isEncryptedPii(user[k]));
  if (!needsDecrypt) return out;

  await Promise.all(
    keys.map(async (k) => {
      if (isEncryptedPii(user[k])) {
        out[k] = (await decryptPiiValue(user[k])) as any;
      }
    }),
  );
  return out;
}
