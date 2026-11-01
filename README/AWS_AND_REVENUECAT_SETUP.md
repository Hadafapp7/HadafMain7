# AWS (Bedrock + SES) and RevenueCat setup

All server variables go in `artifacts/api-server/.env`. Mobile variables go in `artifacts/mobile/.env.local`.
Nothing breaks if they are blank: guilt notifications fall back to template text, emails are skipped, and purchases are disabled.

---

## 1. AWS credentials (shared by Bedrock and SES)

1. Sign in to the AWS Console and open **IAM -> Users -> Create user** (name it `hadaf-backend`).
2. Attach policies directly: **AmazonBedrockFullAccess** and **AmazonSESFullAccess**.
   (For least privilege use `bedrock:InvokeModel`, `bedrock:Converse` and `ses:SendEmail`.)
3. Open the user -> **Security credentials -> Create access key** -> "Application running outside AWS".
4. Put the values in `.env`:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

Alternative for Bedrock only: Bedrock console -> **API keys -> Generate**, then set `AWS_BEARER_TOKEN_BEDROCK=...`.

## 2. Bedrock (guilt notifications)

1. Open the Bedrock console in the same region as `AWS_REGION` (us-east-1, us-east-2 or us-west-2 for the default model).
2. Make sure the model is available (**Model catalog**; request access if the console asks).
3. Default model: Meta Llama 3.2 3B Instruct (open source, lightweight):
```
BEDROCK_MODEL_ID=us.meta.llama3-2-3b-instruct-v1:0
```
   Alternatives: `us.meta.llama3-2-1b-instruct-v1:0` (smaller) or `meta.llama3-1-8b-instruct-v1:0` (better quality).
4. Test it (backend running, signed-in token):
`GET /api/notifications/guilt/preview?trigger=missed_goal`
(triggers: `failed_focus`, `missed_goal`, `inactive`).

How it works: the app calls `GET /api/notifications/guilt` on open/after goal changes. The backend builds the user's facts
(goals, focus sessions, 7-day top apps, days inactive), prompts the model, and returns notifications. The app shows them locally,
and also schedules "not opened in 3 days" and "goal deadline missed" notifications ahead of time. Quiet hours 22:00-08:00 are avoided.

## 3. SES (emails) with your GoDaddy domain

Goal: send from `noreply@yourdomain.com` (replace `yourdomain.com` with the domain you bought).
You do **not** need a real mailbox for `noreply@` - verifying the *domain* lets SES send from any address on it.

### A. Create the domain identity in SES
1. AWS Console -> **Amazon SES** (same region as `AWS_SES_REGION`, e.g. us-east-1) -> **Configuration -> Identities -> Create identity**.
2. Choose **Domain**, enter `yourdomain.com` (no www, no https).
3. Keep **Easy DKIM** (RSA_2048) selected. Optionally tick **Use a custom MAIL FROM domain** and enter `mail.yourdomain.com`.
4. Click **Create identity**. SES now shows **3 CNAME records** (DKIM) and, if you chose a MAIL FROM domain, 1 MX + 1 TXT record.

### B. Add those records in GoDaddy
1. GoDaddy -> **My Products -> your domain -> DNS** (or **Manage DNS**) -> **Add New Record**.
2. For each SES record copy the values exactly:

| Type | Name (Host) | Value |
|------|-------------|-------|
| CNAME | `abc123._domainkey` (SES gives `abc123._domainkey.yourdomain.com` - **remove** the `.yourdomain.com` part, GoDaddy adds it) | `abc123.dkim.amazonses.com` |
| CNAME | second DKIM name, same rule | second DKIM value |
| CNAME | third DKIM name, same rule | third DKIM value |
| MX *(only with custom MAIL FROM)* | `mail` | `feedback-smtp.us-east-1.amazonses.com` , priority `10` |
| TXT *(only with custom MAIL FROM)* | `mail` | `v=spf1 include:amazonses.com ~all` |
| TXT *(recommended)* | `_dmarc` | `v=DMARC1; p=none;` |

   TTL: leave the default (1 hour / 600s). Don't add the trailing dot.
3. Wait. DNS usually propagates in 5-30 minutes (up to 72h). In SES the identity status turns **Verified** and DKIM shows **Successful**.

### C. Point the app at it
In `artifacts/api-server/.env`:
```
SES_FROM_EMAIL=Hadaf <noreply@yourdomain.com>
SES_REPLY_TO=support@yourdomain.com   # optional - where user replies go
```
Restart the API. Welcome / payment / update emails are now sent from your domain.

### D. Leave the SES sandbox (important)
New AWS accounts can only email **verified** addresses. To email real users:
**SES -> Account dashboard -> Request production access** (mail type: Transactional, describe: account, payment and app-update emails; mention you only email registered users). Approval is usually within 24h.
Until then, add your own test addresses under **Identities -> Create identity -> Email address** and verify them.

### E. Test it
```
curl -X POST http://localhost:5000/api/admin/app-update-email \
  -H "x-admin-key: <ADMIN_API_KEY>" -H "Content-Type: application/json" \
  -d '{"version":"1.0.0","notes":"Test email","onlyEmails":["you@gmail.com"]}'
```
(Set `ADMIN_API_KEY` in the API `.env` first.) To receive mail *at* `support@yourdomain.com`, use GoDaddy email forwarding or Workspace - SES here is send-only.

## 4. RevenueCat (Simplified for Local Testing)

You **do not** need Google Play Console, merchants, or webhooks/ngrok for local testing!

### A. The Only 2 Keys You Need
1. **Secret Key (Backend)**:
   - Already in RevenueCat -> **Project settings -> API keys -> Secret API keys**.
   - Paste it in `artifacts/api-server/.env`:
     ```env
     REVENUECAT_SECRET_API_KEY=sk_...
     REVENUECAT_ENTITLEMENT_ID=pro
     ```

2. **Public Key (Mobile App)**:
   - In RevenueCat -> **Project settings -> API keys -> Public app-specific API keys**.
   - Copy the Android key (starts with `goog_` or `test_`).
   - Paste it in `artifacts/mobile/.env.local`:
     ```env
     EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
     EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
     ```

*(You can leave `REVENUECAT_WEBHOOK_AUTH` blank locally; the mobile app syncs directly with the backend via the Secret Key!)*

---

### B. 3 Clicks in RevenueCat Dashboard
1. **Entitlements**:
   - Go to **Entitlements** in the sidebar -> click **+ New**.
   - Identifier: `pro`
   - Display name: `Pro Access` -> Save.
2. **Products**:
   - Go to **Products** -> click **+ New**.
   - Identifier: `hadaf_pro_monthly`
   - Store: Select your App (or Test Store) -> Save.
   - Attach it to the `pro` entitlement you just made.
3. **Offerings**:
   - Go to **Offerings** -> click on the `default` offering (or create one).
   - Click **+ Add Package** -> select type **Monthly**.
   - Select the `hadaf_pro_monthly` product -> Save.

---

### C. How to Test Everything Locally (Zero Setup Needed)

#### 1. How to Test the 5-Day Free Trial
Every new user gets full, unlimited access for 5 days automatically without any keys.

#### 2. How to Test the "Limited Tier" (Locked features)
To test what happens after the 5-day trial ends (1 session capped at 5 mins, locked goals, blurred analytics):
- Open **Supabase** -> **Table Editor** -> **users**.
- Find your user and edit `trial_started_at` to a date 6 days in the past (e.g. `2026-10-10`).
- Refresh the app! You will instantly see the lock banner on Goals, the blur on Activity, and the 5-minute cap on Focus.

#### 3. How to Test the "Pro Tier" ($10/month) Locally
Instead of setting up credit cards or Google Play:
- In RevenueCat Dashboard, go to **Customers** -> search your user.
- Click **Grant Promotional Entitlement** -> select **pro** -> select duration (e.g. 1 month).
- Open the mobile app and go to **Profile -> Subscription -> Restore Purchases** (or restart the app).
- Your app will instantly unlock all Pro features!

### Troubleshooting: "Subscriptions aren't available"
The Subscription screen now prints the exact reason under the Upgrade button. Common ones:
- **"in-app purchase module isn't in this app build"** -> the installed app was built before `react-native-purchases` was added. Rebuild: `npx expo run:android` (or `eas build --profile development --platform android`) and reinstall. Expo Go / old dev clients cannot do this.
- **"No RevenueCat API key found"** -> `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` missing in `artifacts/mobile/.env.local`. Restart Metro with the cache cleared: `npx expo start --dev-client -c` (EXPO_PUBLIC_* values are baked in at bundle time).
- **"no package to sell"** -> in RevenueCat: **Product catalog -> Offerings** -> open the offering, press **Make current**, and add a **Monthly** package pointing at your product. With a `test_` key the product must live under the **Test Store** app (Product catalog -> Products -> New -> Test Store) and be attached to the `pro` entitlement.
- **"Couldn't load products ... could not be fetched"** -> the product id in RevenueCat doesn't exist in the store you're testing with (Test Store key = Test Store products).

Key rules: a `test_...` Test Store key is for development builds only (never ship it). For release builds use the Google `goog_...` key. Optionally put the test key in `EXPO_PUBLIC_REVENUECAT_TEST_KEY` - dev builds use it automatically, release builds use the Android key.

## 5. Database

The new columns (`trial_started_at`, `subscription_tier`, `subscription_expires_at`, `last_active_at`, `last_guilt_at`, `welcome_email_sent_at`) have **already been applied** to the Supabase database via Drizzle push.

If you ever reset or switch databases, you can re-apply schema changes with:
```
pnpm --filter @workspace/db run push
```
