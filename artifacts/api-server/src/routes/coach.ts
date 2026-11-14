import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  db,
  usersTable,
  goalsTable,
  focusSessionsTable,
  appUsageEntriesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { generateWithBedrock, isBedrockConfigured } from "../lib/bedrock";

const router: IRouter = Router();

function fmtMin(m: number): string {
  const v = Math.max(0, Math.round(m));
  const h = Math.floor(v / 60);
  const r = v % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${v}m`;
}

const SOCIAL_MEDIA_KEYWORDS = [
  "instagram",
  "tiktok",
  "facebook",
  "snapchat",
  "twitter",
  "reddit",
  "pinterest",
  "threads",
  "youtube",
  "linkedin",
  "social",
  "reels",
  "shorts",
];

function isSocialMedia(appName: string, category?: string | null): boolean {
  const n = (appName || "").toLowerCase();
  const c = (category || "").toLowerCase();
  return SOCIAL_MEDIA_KEYWORDS.some((kw) => n.includes(kw) || c.includes(kw));
}

// In-memory cache per user with 5-minute TTL to keep home visits instant
const coachCache = new Map<string, { data: any; expiresAt: number }>();

router.get("/coach/reality-check", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const force = req.query.refresh === "true";

  const cached = coachCache.get(userId);
  if (!force && cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  try {
    const [[user], goals, sessions, todayUsage, weekUsage] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, userId)),
      db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
      db
        .select()
        .from(focusSessionsTable)
        .where(and(eq(focusSessionsTable.userId, userId), gte(focusSessionsTable.startedAt, weekAgo))),
      db
        .select()
        .from(appUsageEntriesTable)
        .where(and(eq(appUsageEntriesTable.userId, userId), gte(appUsageEntriesTable.loggedAt, todayStart))),
      db
        .select()
        .from(appUsageEntriesTable)
        .where(and(eq(appUsageEntriesTable.userId, userId), gte(appUsageEntriesTable.loggedAt, weekAgo))),
    ]);

    // If new user with zero activity, return null reality check
    if (todayUsage.length === 0 && sessions.length === 0 && goals.length === 0) {
      res.json({
        tag: "REALITY CHECK",
        title: null,
        message: null,
        isNull: true,
        source: "fallback",
        streak: 0,
        screenTimeToday: "0m",
      });
      return;
    }

    // Screen time stats
    const todayMins = todayUsage.reduce((s, e) => s + e.durationMinutes, 0);

    // Social media screen time calculation
    const socialMediaUsage = todayUsage.filter((e) => isSocialMedia(e.appName, e.category));
    const socialMediaMins = socialMediaUsage.reduce((s, e) => s + e.durationMinutes, 0);
    const isGuiltMode = socialMediaMins > 180; // Only guilt when social media > 3 hours (180 mins)

    const topSocialApp = [...socialMediaUsage].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
    const sortedTodayApps = [...todayUsage].sort((a, b) => b.durationMinutes - a.durationMinutes);
    const topTodayApp = sortedTodayApps[0];

    // Weekly top apps
    const appMap = new Map<string, number>();
    for (const e of weekUsage) {
      appMap.set(e.appName, (appMap.get(e.appName) ?? 0) + e.durationMinutes);
    }
    const topWeekApp = [...appMap.entries()].sort((a, b) => b[1] - a[1])[0];

    // Focus & Goals
    const completedSessions = sessions.filter((s) => s.status === "completed").length;
    const quitSessions = sessions.filter((s) => s.status === "stopped").length;
    const pendingGoals = goals.filter((g) => g.status === "pending").length;
    const streak = user?.currentStreak ?? 0;

    const facts = [
      user?.name ? `- Name: ${user.name}` : "",
      `- Current streak: ${streak} day(s)`,
      `- Screen time today: ${fmtMin(todayMins)}`,
      `- Social media screen time today: ${fmtMin(socialMediaMins)} (Threshold for guilt is 3 hours / 180m)`,
      topSocialApp ? `- Top social media sink: ${topSocialApp.appName} (${fmtMin(topSocialApp.durationMinutes)})` : "",
      topTodayApp ? `- Most used app today: ${topTodayApp.appName} (${fmtMin(topTodayApp.durationMinutes)})` : "",
      topWeekApp ? `- Biggest time sink this week: ${topWeekApp[0]} (${fmtMin(topWeekApp[1])})` : "",
      `- Focus sessions completed this week: ${completedSessions}`,
      `- Focus sessions forfeited / stopped early: ${quitSessions}`,
      `- Pending goals: ${pendingGoals}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = isGuiltMode
      ? `You are Hadaf's Reality Check Coach. Write a short, punchy 2-sentence reality check widget for the app's home screen.
The user has wasted ${fmtMin(socialMediaMins)} on social media today, which is GREATER than 3 hours!
Sentence 1: Deliver a sharp, intense guilt-inducing reality check making them feel deeply guilty about wasting over 3 hours on mindless feeds while their goals rot.
Sentence 2: Deliver an immediate fierce motivational kick to put the phone down and lock in a 25-minute focus session right now.

Rules:
- Exactly 2 sentences.
- At most 28 words total.
- Simple, direct words.
- Reply ONLY with a JSON object:
{"title": "3-5 word guilt hook", "message": "Sentence 1. Sentence 2."}

USER FACTS:
${facts}`
      : `You are Hadaf's Reality Check Coach. Write a short, punchy 2-sentence reality check widget for the app's home screen.
The user's social media screen time today is only ${fmtMin(socialMediaMins)} (under 3 hours). Do NOT give any guilt messages about social media or phone waste.
Sentence 1: Acknowledge that they have kept distractions disciplined today.
Sentence 2: Give a high-energy kick to lock in a 25-minute focus session right now to stay ahead.

Rules:
- Exactly 2 sentences.
- At most 28 words total.
- Simple, direct words.
- Reply ONLY with a JSON object:
{"title": "3-5 word motivation hook", "message": "Sentence 1. Sentence 2."}

USER FACTS:
${facts}`;

    let title = isGuiltMode ? "3+ hours on social feeds" : "Discipline is winning";
    let message = "";
    let source: "bedrock" | "fallback" = "fallback";

    if (isBedrockConfigured()) {
      try {
        const raw = await generateWithBedrock(prompt, { maxTokens: 120, temperature: 0.8 });
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.message && String(parsed.message).trim().length >= 10) {
            title = String(parsed.title || (isGuiltMode ? "Reality Check" : "Stay Locked In")).trim();
            message = String(parsed.message).trim();
            source = "bedrock";
          }
        }
      } catch (err: any) {
        console.warn("[Coach] Bedrock call failed, using intelligent fallback:", err?.message || err);
      }
    }

    if (!message) {
      if (isGuiltMode) {
        title = `${fmtMin(socialMediaMins)} lost to social media`;
        message = `You surrendered ${fmtMin(socialMediaMins)} to mindless social feeds today while your real ambitions waited. Put the phone down and lock in 25 minutes of focus right now.`;
      } else {
        title = "Discipline is in control";
        message = `You kept social media under 3 hours today (${fmtMin(socialMediaMins)}). Protect this momentum and get ahead with a 25-minute focus session now.`;
      }
    }

    const result = {
      tag: "REALITY CHECK",
      title,
      message,
      source,
      streak,
      screenTimeToday: fmtMin(todayMins),
      socialMediaMins,
      isGuiltMode,
    };

    coachCache.set(userId, { data: result, expiresAt: Date.now() + 5 * 60_000 });
    res.json(result);
  } catch (err: any) {
    console.error("[Coach] Reality check error:", err);
    res.json({
      tag: "REALITY CHECK",
      title: "Focus on what matters",
      message: "Distraction steals your time silently. Lock in for a 25-minute focus session right now.",
      source: "fallback",
    });
  }
});

router.post("/coach/evaluate-forfeit", requireAuth, async (req, res): Promise<void> => {
  const { type, reason, context } = req.body || {};
  const cleanReason = String(reason || "").trim();

  // Keyword check for lame reasons
  const LAME_PATTERNS = [
    /bored/i, /lazy/i, /tired/i, /tiktok/i, /instagram/i, /insta/i, /youtube/i, /reels/i,
    /scroll/i, /later/i, /tomorrow/i, /game/i, /gaming/i, /snack/i, /hungry/i,
    /dont feel like/i, /don't feel like/i, /can't focus/i, /cant focus/i, /distract/i,
    /sleepy/i, /hard/i, /boring/i, /netflix/i, /chilling/i, /texting/i, /friend/i, /chat/i,
    /gave up/i, /quitting/i
  ];
  const GENUINE_PATTERNS = [
    /hospital/i, /doctor/i, /emergency/i, /accident/i, /injury/i, /sick/i, /fever/i,
    /client/i, /boss/i, /urgent/i, /family emergency/i, /ambulance/i, /fire/i, /danger/i
  ];

  let isLame = true;
  if (GENUINE_PATTERNS.some((p) => p.test(cleanReason))) {
    isLame = false;
  } else if (cleanReason.length < 5 || LAME_PATTERNS.some((p) => p.test(cleanReason))) {
    isLame = true;
  }

  const prompt = `You are Hadaf's Ruthless Reality Check Coach.
The user is giving up and FORFEITING their ${type === "focus" ? "focus session" : "goal"}.
User's stated reason: "${cleanReason || 'No reason provided'}".
Context: ${JSON.stringify(context || {})}.

Task:
Analyze if this reason is LAME/WEAK (excuses, boredom, laziness, social media, lack of discipline) or GENUINE (urgent medical or family emergency, critical work crisis).

Rules:
1. If the reason is LAME or weak: Deliver a harsh, strict reality check about the ACTION (not the person's worth). Speak directly to "you", reference their exact reason and the goal/session name, and make them feel the cost of quitting (e.g. "You quit 'Study chapter 4' because you felt lazy. Your future self is still waiting on that chapter."). No profanity, no insults about the person, nothing about health, body or family. Keep it to 2 punchy sentences.
2. If the reason is GENUINE: Be firm and less strict. Acknowledge real-life priorities come first, and tell them to handle it and get back on track. Keep it to 2 punchy sentences.
3. Reply ONLY with a valid JSON object:
{"isLame": boolean, "roast": "2 sentence message"}`;

  let roast = "";
  if (isBedrockConfigured()) {
    try {
      const raw = await generateWithBedrock(prompt, { maxTokens: 140, temperature: 0.8 });
      const match = raw.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.roast) {
          roast = String(parsed.roast).trim();
          isLame = Boolean(parsed.isLame);
        }
      }
    } catch (e: any) {
      console.warn("[Coach] evaluate-forfeit Bedrock error:", e?.message);
    }
  }

  if (!roast) {
    if (isLame) {
      roast = `You quit your ${type === "focus" ? "focus session" : "goal"}${context?.title ? ` "${String(context.title).slice(0, 60)}"` : ""} because: "${cleanReason || "no reason"}". That's an excuse, not a reason — your future self is still waiting on it.`;
    } else {
      roast = `Legitimate priorities come first. Handle what you need to do, reset, and make sure you finish your ${type === "focus" ? "focus block" : "goal"} before the day ends.`;
    }
  }

  res.json({
    isLame,
    roast,
    title: isLame ? "Weak Discipline" : "Reason Acknowledged",
  });
});

export default router;

