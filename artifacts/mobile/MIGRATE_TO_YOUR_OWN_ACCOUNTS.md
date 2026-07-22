# Moving Hadaf to Your Own EAS + Clerk Accounts

Hey — this project currently builds using **my** Expo/EAS account and **my** Clerk app. If you want to work on this independently (build your own APKs, manage your own environment variables, not depend on my accounts at all), follow the steps below. Takes about 15 minutes.

You already have the full project (including git history), so you don't need to redo any of the earlier build fixes — just re-point it at your own accounts.

---

## 1. Create your accounts

- **Expo/EAS:** sign up free at [expo.dev](https://expo.dev), then on your machine:
  ```
  npm install -g pnpm eas-cli
  eas login
  ```
- **Clerk:** sign up free at [clerk.com](https://clerk.com), create a new application (call it whatever you want), and on the **API Keys** page copy the **Publishable key** — it starts with `pk_test_...`.

---

## 2. Install dependencies

From the project root:
```
pnpm install
```

---

## 3. Re-link the EAS project to your account

Open `artifacts/mobile/app.config.js` and find this block near the bottom:
```js
extra: {
  eas: {
    projectId: "cd0e5f1d-d9b1-4a84-b6fa-7c96653f7c69"
  }
},
owner: "tauqirmomin77",
```
Delete the `extra` and `owner` fields entirely (they point at my project, not yours).

Then, from `artifacts/mobile`, run:
```
eas init --non-interactive --force
```
This creates a **brand-new EAS project under your account** and prints a new project ID, something like:
```
Created @your-username/mobile: https://expo.dev/accounts/your-username/projects/mobile
```

Because `app.config.js` is a dynamic JS file (not a plain `app.json`), the EAS CLI can't write the project ID into it automatically — you have to add it back in yourself. Put this back into the same spot in `app.config.js`, using **your** new ID and **your** Expo username:
```js
extra: {
  eas: {
    projectId: "<the ID that was just printed>"
  }
},
owner: "<your-expo-username>",
```

---

## 4. Register your own Clerk key

Still from `artifacts/mobile`:
```
eas env:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value <your_pk_test_...> ^
  --environment development --environment preview --environment production ^
  --visibility plaintext --non-interactive
```
*(On Mac/Linux use `\` instead of `^` for line continuation.)*

Then pull it down locally so `expo start` picks it up too — this overwrites the `.env.local` file that currently has my key in it:
```
eas env:pull --environment development
```

---

## 5. Build your own APK

```
eas build --platform android --profile development --non-interactive   # dev-client, for live debugging
eas build --platform android --profile preview --non-interactive       # regular installable APK
```
EAS will auto-generate a fresh signing keystore for your new project on the first build — that's normal, not an error.

---

## 6. Commit your changes

The `app.config.js` edit (new project ID + owner) is worth committing so the history reflects it:
```
git config user.name "Your Name"
git config user.email "you@example.com"
git add artifacts/mobile/app.config.js
git commit -m "Link EAS project to my own account"
```

---

## Things worth knowing

- **The Android package name (`com.hadaf.mobile`) stays the same for both of us.** That's totally fine while we're each building separate test APKs. It only matters later if this app ever gets published to the Play Store for real — at that point only one of us can be the "official" signer, but that's a future conversation, not something to worry about now.
- **You're keeping the full git history**, including my commits. Nothing needs to be rewritten — your new commits just get added on top.
- **Simpler alternative:** if full independence isn't actually necessary, it's much faster for me to just add you as a collaborator on my existing EAS project (Expo dashboard → project → Members) and my Clerk app (Clerk dashboard → team) — no code changes at all. Worth considering if we're going to be actively co-developing rather than working separately.

## Checklist — how you know it worked

- [ ] `eas whoami` shows your account, not mine
- [ ] `app.config.js` has your project ID and your username as owner
- [ ] `eas build:view <build-id>` shows the build under your account
- [ ] The installed APK opens without crashing (that would mean your Clerk key didn't get picked up — double check `.env.local` and the EAS env var)