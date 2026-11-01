import { Router, type IRouter } from "express";
import { isNotNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { appUpdateEmail, isEmailConfigured, sendEmail } from "../lib/email";

const router: IRouter = Router();

/**
 * Send an "app update" email to every user that has an email address.
 *
 *   curl -X POST http://localhost:5000/api/admin/app-update-email \
 *     -H "x-admin-key: <ADMIN_API_KEY>" -H "Content-Type: application/json" \
 *     -d '{"version":"1.2.0","headline":"Hadaf 1.2 is here","notes":["Guilt nudges","Faster analytics"]}'
 *
 * Optional: "onlyEmails": ["you@example.com"] to send a test to specific people first.
 */
router.post("/admin/app-update-email", async (req, res): Promise<void> => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isEmailConfigured()) {
    res.status(503).json({ error: "SES is not configured (AWS keys + SES_FROM_EMAIL)." });
    return;
  }

  const { version, headline, notes, onlyEmails } = req.body ?? {};
  if (typeof version !== "string" || !Array.isArray(notes) || notes.length === 0) {
    res.status(400).json({ error: 'Body needs "version" (string) and "notes" (non-empty string array).' });
    return;
  }

  let recipients = (await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(isNotNull(usersTable.email))) as { email: string; name: string | null }[];

  if (Array.isArray(onlyEmails) && onlyEmails.length > 0) {
    const allow = new Set(onlyEmails.map((e: string) => String(e).toLowerCase()));
    recipients = recipients.filter((r) => allow.has(r.email.toLowerCase()));
  }

  res.status(202).json({ queued: recipients.length });

  // Send in the background, gently (SES sandbox allows 1 email/second).
  void (async () => {
    let sent = 0;
    for (const r of recipients) {
      const mail = appUpdateEmail(r.name, { version, headline, notes: notes.map(String) });
      const result = await sendEmail({ to: r.email, ...mail });
      if (result.sent) sent++;
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    console.log(`[Admin] App update email finished: ${sent}/${recipients.length} sent`);
  })();
});

export default router;
