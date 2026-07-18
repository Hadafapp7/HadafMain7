import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
  const auth = getAuth(req);
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
      const clerkUser = await clerkClient.users.getUser(userId);
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        "";
      const name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null;

      await db
        .insert(usersTable)
        .values({
          id: userId,
          email,
          name,
          avatarUrl: clerkUser.imageUrl ?? null,
        })
        .onConflictDoNothing();
    }
  } catch (err) {
    req.log.error({ err }, "Failed to JIT-provision user");
    res.status(500).json({ error: "Failed to provision user" });
    return;
  }

  next();
}
