import { randomInt } from "crypto";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ───────────── Phone one-time codes (a fresh random code for every sign-in) ─────────────
const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_MS = 5_000;
const OTP_MAX_ATTEMPTS = 5;
const otpStore = new Map<string, { code: string; expires: number; createdAt: number; attempts: number }>();

/**
 * While there is no SMS provider connected, the code is returned in the API response so the
 * app can autofill it (and it is printed in the server log). Set OTP_RETURN_IN_RESPONSE=false
 * (or run with NODE_ENV=production) once real SMS delivery is plugged in below.
 */
const exposeOtpInResponse = (): boolean =>
  process.env.OTP_RETURN_IN_RESPONSE
    ? process.env.OTP_RETURN_IN_RESPONSE === "true"
    : process.env.NODE_ENV !== "production";

router.post("/auth/phone-otp/request", async (req, res) => {
  const raw = req.body?.phone;
  const digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (digits.length < 8) {
    res.status(400).json({ error: "Please enter a valid phone number." });
    return;
  }

  const previous = otpStore.get(digits);
  if (previous && Date.now() - previous.createdAt < OTP_RESEND_MS) {
    res.status(429).json({ error: "Please wait a few seconds before requesting another code." });
    return;
  }

  const code = String(randomInt(100000, 1000000));
  otpStore.set(digits, { code, expires: Date.now() + OTP_TTL_MS, createdAt: Date.now(), attempts: 0 });
  console.log(`[Auth] One-time code for +${digits}: ${code} (valid 5 minutes)`);

  // TODO: deliver `code` by SMS here (e.g. AWS SNS / Twilio) before turning off devOtp.

  res.json({ sent: true, ...(exposeOtpInResponse() ? { devOtp: code } : {}) });
});

router.post("/auth/phone-login", async (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "Phone number is required." });
    return;
  }

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length < 8) {
    res.status(400).json({ error: "Invalid phone number." });
    return;
  }

  // The one-time code must have been requested for this number and match exactly.
  const submittedOtp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  const entry = otpStore.get(cleanPhone);
  if (!entry || entry.expires < Date.now()) {
    otpStore.delete(cleanPhone);
    res.status(400).json({ error: "This code has expired. Please request a new one." });
    return;
  }
  entry.attempts += 1;
  if (entry.attempts > OTP_MAX_ATTEMPTS) {
    otpStore.delete(cleanPhone);
    res.status(400).json({ error: "Too many wrong attempts. Please request a new code." });
    return;
  }
  if (submittedOtp !== entry.code) {
    res.status(400).json({ error: "Incorrect code. Please try again." });
    return;
  }
  otpStore.delete(cleanPhone); // single use

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    res.status(500).json({ error: "Clerk secret key is not configured." });
    return;
  }

  try {
    let user: any = null;
    const domains = ["hadaf.app", "maxxspace.com", "emalupe.com"];

    for (const domain of domains) {
      const emailToSearch = `phone-${cleanPhone}@${domain}`;
      const searchRes = await fetch(
        `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(emailToSearch)}`,
        { headers: { Authorization: `Bearer ${secret}` } }
      );
      const users = (await searchRes.json()) as any;
      if (Array.isArray(users) && users.length > 0) {
        user = users[0];
        console.log(`[Auth] Found existing Clerk user for phone +${cleanPhone}:`, user.id);
        break;
      }
    }

    if (!user) {
      const virtualEmail = `phone-${cleanPhone}@hadaf.app`;
      console.log(`[Auth] Creating new Clerk user for phone +${cleanPhone} with ${virtualEmail}`);
      const createRes = await fetch("https://api.clerk.com/v1/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: [virtualEmail],
          skip_password_requirement: true,
        }),
      });
      user = (await createRes.json()) as any;
      if (!user || !user.id) {
        console.error("[Auth] User creation failed:", user);
        res.status(500).json({ error: "Failed to initialize user session on authentication server." });
        return;
      }
    }

    // Generate passwordless sign-in ticket token
    const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: user.id }),
    });
    const tokenData = (await tokenRes.json()) as any;

    if (!tokenData.token) {
      console.error("[Auth] Token creation failed:", tokenData);
      res.status(500).json({ error: "Failed to issue authentication ticket." });
      return;
    }

    console.log(`[Auth] Issued sign-in ticket for phone +${cleanPhone}:`, tokenData.id);
    res.json({
      success: true,
      ticket: tokenData.token,
      phone: `+${cleanPhone}`,
    });
  } catch (err: any) {
    console.error("[Auth] Phone login exception:", err);
    res.status(500).json({ error: "An unexpected error occurred during phone login." });
  }
});

export default router;
