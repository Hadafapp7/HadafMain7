import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import dns from "dns";
import net from "net";

const router: IRouter = Router();

const validateEmailDomain = async (emailStr: string): Promise<boolean> => {
  const parts = emailStr.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  
  const commonDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "mail.com", "proton.me", "protonmail.com", "zoho.com", "gmx.com", "aol.com"];
  
  // 1. Get MX records
  const mxRecords: dns.MxRecord[] = await new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses) resolve([]);
      else resolve(addresses.sort((a, b) => a.priority - b.priority));
    });
  });

  if (mxRecords.length === 0) {
    return false;
  }

  // 2. For common public providers, run strict SMTP verification
  const mxHost = mxRecords[0].exchange;
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    socket.setTimeout(4000);

    let step = 0;
    let success = false;

    socket.on("connect", () => {
      // Socket connected
    });

    socket.on("data", (data) => {
      const response = data.toString();
      if (response.startsWith("220") && step === 0) {
        socket.write("HELO hadaf.app\r\n");
        step = 1;
      } else if (response.startsWith("250") && step === 1) {
        socket.write("MAIL FROM:<verify@hadaf.app>\r\n");
        step = 2;
      } else if (response.startsWith("250") && step === 2) {
        socket.write(`RCPT TO:<${emailStr}>\r\n`);
        step = 3;
      } else if (step === 3) {
        if (response.startsWith("250")) {
          success = true;
        }
        socket.write("QUIT\r\n");
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      // If outbound port 25 is firewalled/blocked by ISP, fallback to true since MX records exist
      console.log("[SMTP Debug] Timeout reached. Falling back to MX presence.");
      resolve(true);
    });

    socket.on("error", (err) => {
      socket.destroy();
      // Fallback to true if SMTP port 25 is blocked to prevent false-positives
      console.log("[SMTP Debug] Connection error, falling back to MX presence:", err.message);
      resolve(true);
    });

    socket.on("close", () => {
      resolve(success);
    });
  });
};

const getMeHandler = async (req: any, res: any): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      res.status(200).json({
        id: userId,
        name: null,
        email: null,
        avatarUrl: null,
        phone: null,
        gender: null,
        age: null,
        xp: 0,
        level: 1,
        currentStreak: 0,
        bestStreak: 0,
      });
      return;
    }

    // Self-healing logic for profiles provisioned with virtual emails
    if (user && !user.phone && user.email && user.email.startsWith("phone-") &&
       (user.email.includes("@emalupe.com") || user.email.includes("@1secmail.com") || user.email.includes("@hadaf.app"))) {
      const extractedDigits = user.email.replace("phone-", "").split("@")[0];
      const parsedPhone = "+" + extractedDigits;
      
      const [repairedUser] = await db
        .update(usersTable)
        .set({
          phone: parsedPhone,
          email: null,
        })
        .where(eq(usersTable.id, userId))
        .returning();
        
      if (repairedUser) {
        user = repairedUser;
      }
    }

    res.status(200).json(user);
  } catch (err: any) {
    console.error("[Users] Get me error:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
};

const updateMeHandler = async (req: any, res: any): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, avatarUrl, email, phone, gender, age } = req.body || {};

  // Verify email domain actually exists and can receive mail
  if (email) {
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: "Email must contain lowercase letters only." });
      return;
    }

    const isDomainValid = await validateEmailDomain(email);
    if (!isDomainValid) {
      res.status(400).json({ error: "Email address does not exist. Please enter a valid email." });
      return;
    }
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({
        ...(name !== undefined && { name: name ? name.trim() : null }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(email !== undefined && { email: email ? email.trim() : null }),
        ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
        ...(gender !== undefined && { gender: gender ? gender.trim() : null }),
        ...(age !== undefined && { age: age ? age.trim() : null }),
      })
      .where(eq(usersTable.id, userId))
      .returning();

    res.status(200).json(updated);
  } catch (err: any) {
    console.error("[Users] Update me error:", err);
    res.status(500).json({ error: "Failed to update user profile" });
  }
};

// Support both endpoint mappings (OpenAPI standard and legacy users prefix)
router.get("/me", requireAuth, getMeHandler);
router.get("/users/me", requireAuth, getMeHandler);
router.patch("/me", requireAuth, updateMeHandler);
router.patch("/users/me", requireAuth, updateMeHandler);

export default router;
