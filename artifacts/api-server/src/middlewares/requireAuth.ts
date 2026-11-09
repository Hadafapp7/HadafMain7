import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { maybeSendWelcomeEmail } from "../lib/email";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Requires a valid Clerk session and JIT-provisions a local `users` row on
 * first sighting of a given Clerk user id, so downstream tables can safely
 * reference `req.userId` as a foreign key.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
          const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
          console.log("[Auth Debug] Decoded JWT Payload:", JSON.stringify(payload, null, 2));
        }
      } catch (err) {
        console.log("[Auth Debug] Failed to decode token:", (err as any).message);
      }
    }
  }
  const auth = getAuth(req);
  req.log.info({
    authUserId: auth?.userId,
    hasAuthHeader: !!req.headers.authorization,
    authStatus: auth ? {
      sessionId: auth.sessionId,
      claims: (auth as any).claims,
    } : null
  }, "[requireAuth] Diagnostics");

  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = userId;

  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!existing) {
      let email: string | null = null;
      let phone: string | null = null;
      let name: string | null = null;
      let avatarUrl: string | null = null;

      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        const primaryEmail =
          clerkUser.primaryEmailAddress?.emailAddress ??
          clerkUser.emailAddresses[0]?.emailAddress ??
          "";
        
        if (primaryEmail.startsWith("phone-")) {
          const extractedDigits = primaryEmail.replace("phone-", "").split("@")[0];
          phone = "+" + extractedDigits;
          email = null; // Leave blank for name and other details
        } else {
          email = primaryEmail || null;
        }

        name =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          null;
        avatarUrl = clerkUser.imageUrl ?? null;
      } catch (clerkErr: any) {
        console.warn("[requireAuth] Could not fetch Clerk user profile details:", clerkErr.message || clerkErr);
      }

      await db
        .insert(usersTable)
        .values({
          id: userId,
          email,
          phone,
          name,
          avatarUrl,
        })
        .onConflictDoNothing();

      // New account created -> welcome email (only when we already know their email).
      if (email) void maybeSendWelcomeEmail(userId);
    }
  } catch (err: any) {
    const isDbUnreachable = err?.message?.includes("tenant") || err?.message?.includes("ENOTFOUND") || err?.code === "XX000";
    if (isDbUnreachable) {
      console.error("[Database Error] Supabase database is unreachable. Project may be paused in Supabase Dashboard:", err.message || err);
      res.status(503).json({
        error: "Database is unreachable. Your Supabase project appears to be PAUSED. Please visit https://supabase.com/dashboard and click 'Restore project'."
      });
      return;
    }
    req.log.error({ err }, "Failed to JIT-provision user");
    res.status(500).json({ error: "Failed to provision user: " + (err?.message || "Internal error") });
    return;
  }

  next();
}
