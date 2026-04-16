# AgentK Authentication Pipeline — Design Spec
**Date:** 2026-04-06  
**Stack:** Next.js 15 · BetterAuth · Drizzle + Turso (LibSQL) · Convex  
**Scope:** Login/signup modal, Google OAuth, email/password, persistent sessions, avatar in Navbar

---

## 1. Architecture

```
Browser
  └─ Navbar            — shows Login button or user avatar (first letter of email)
  └─ AuthModal         — centered modal, no blur/shadow; manages login + signup flows

Next.js (App Router)
  └─ /api/auth/[...all]  — BetterAuth universal handler (GET + POST)
  └─ lib/auth.ts         — BetterAuth server instance (providers, DB, hooks)
  └─ lib/auth-client.ts  — BetterAuth React client (authClient singleton)
  └─ lib/db.ts           — Drizzle + Turso connection

BetterAuth after-hook
  └─ On sign-up: calls Convex `users.upsert` mutation with user_id, email, username, created_at

Turso (LibSQL)          — BetterAuth tables: user, session, account
Convex                  — users table: betterAuthId, email, username, createdAt
```

**Session flow:** BetterAuth sets an `HttpOnly` persistent cookie on the client after login. On each page load, `authClient.useSession()` (React hook) reads the session from `/api/auth/get-session` — no manual token handling required.

---

## 2. Database

### 2a. Turso (BetterAuth tables)
Managed automatically by BetterAuth CLI (`npx @better-auth/cli generate` + `npx drizzle-kit migrate`). Tables created: `user`, `session`, `account`. No manual schema needed.

### 2b. Convex — new `users` table added to `schema.ts`
```ts
users: defineTable({
  betterAuthId: v.string(),   // BetterAuth user.id
  email:        v.string(),
  username:     v.string(),
  createdAt:    v.number(),   // Unix ms
})
  .index("by_better_auth_id", ["betterAuthId"])
  .index("by_email", ["email"]),
```

### 2c. Convex mutation — `convex/users.ts`
```ts
export const upsert = mutation({
  args: { betterAuthId: v.string(), email: v.string(), username: v.string(), createdAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", q => q.eq("betterAuthId", args.betterAuthId))
      .unique();
    if (!existing) await ctx.db.insert("users", args);
  },
});
```

---

## 3. BetterAuth Server Config (`lib/auth.ts`)

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "./db";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,
  database: drizzleAdapter(db, { provider: "sqlite" }),

  session: {
    cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30 }, // 30 days
  },

  emailAndPassword: { enabled: true },

  socialProviders: {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up")) {
        const session = ctx.context.newSession;
        if (session?.user) {
          const { id, email, name } = session.user;
          ctx.context.runInBackground(async () => {
            await fetchMutation(api.users.upsert, {
              betterAuthId: id,
              email:        email ?? "",
              username:     name ?? email?.split("@")[0] ?? "user",
              createdAt:    Date.now(),
            });
          });
        }
      }
    }),
  },
});
```

**Environment variables required:**
```
BETTER_AUTH_SECRET=          # min 32 chars, generate: openssl rand -base64 32
BETTER_AUTH_URL=             # http://localhost:3000 (dev) / https://agentk.com (prod)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TURSO_DATABASE_URL=          # libsql://your-db.turso.io
TURSO_AUTH_TOKEN=
CONVEX_URL=                  # same value as NEXT_PUBLIC_CONVEX_URL, used server-side by fetchMutation
```

---

## 4. Turso + Drizzle Connection (`lib/db.ts`)

```ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const db = drizzle(client);
```

**Packages to install:**
```
better-auth
drizzle-orm
@libsql/client
drizzle-kit          (devDependency)
```

---

## 5. Next.js Route Handler (`app/api/auth/[...all]/route.ts`)

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

---

## 6. Auth Client (`lib/auth-client.ts`)

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});
```

Add to `.env.local`: `NEXT_PUBLIC_APP_URL=http://localhost:3000`

---

## 7. Auth Modal (`components/AuthModal.tsx`)

Single component managing all auth states. No backdrop blur, no shadow — clean white card centered in a semi-transparent overlay.

### States / Views
```
"login"          — default when modal opens
"signup-email"   — email input (step 1 of email signup)
"signup-username"— username input (step 2)
"signup-password"— password input + eye toggle (step 3)
```

### Login view
- **Continue with Google** button (full-width, outlined)
- Divider `— or —`
- Email input
- Password input with eye toggle (show/hide)
- **Login** button (brand gradient, full-width)
- Footer link: `New here? Sign up →` → switches to `signup-email`

### Signup flow (email)
- **Step 1 — Email:** single email input → Next
- **Step 2 — Username:** single username input (3–20 chars, alphanumeric + underscore) → Next
- **Step 3 — Password:** password input (min 8 chars) + eye toggle → Create Account
- Back arrow on steps 2 and 3
- **Continue with Google** also available at step 1 as an alternative

### Google auth
Calls `authClient.signIn.social({ provider: "google", callbackURL: "/" })`. Google handles the redirect; BetterAuth processes the callback. After successful OAuth, the after-hook fires and syncs the user to Convex.

### Email/password auth
- **Login:** `authClient.signIn.email({ email, password })`
- **Signup:** `authClient.signUp.email({ email, password, name: username })`

### Error handling
- Invalid credentials → inline error below the form, red text, no toast
- Username taken → inline error on username step
- Password too short → inline error on password step (enforced client-side before submit)

### Styling
- Modal card: `max-w-[400px] w-full`, `rounded-2xl`, `bg-white`, `border border-black/8`, no box-shadow
- Overlay: `fixed inset-0 z-50 flex items-center justify-center`, `bg-black/30`
- Brand gradient buttons: `linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)`
- Google button: white bg, `border border-black/10`, Google "G" SVG icon inline

---

## 8. Navbar Updates (`components/Navbar.tsx`)

Convert to `"use client"`. Import `authClient` and use `authClient.useSession()`.

```tsx
const { data: session } = authClient.useSession();
const email = session?.user?.email ?? "";
const initial = email.charAt(0).toUpperCase();

// Render:
{session
  ? <div className="w-8 h-8 rounded-full bg-[#DF849D] flex items-center justify-center text-white text-sm font-bold">{initial}</div>
  : <button onClick={() => setAuthOpen(true)}>Login</button>
}
```

`AuthModal` is rendered at the bottom of Navbar's JSX, controlled by `authOpen` state.

---

## 9. Google Cloud Console Setup (manual, one-time)

1. Create OAuth 2.0 credentials at [console.cloud.google.com](https://console.cloud.google.com)
2. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://agentk.com/api/auth/callback/google` (when deploying)
3. Copy Client ID and Secret → `.env.local`

---

## 10. File Checklist

| File | Action |
|------|--------|
| `lib/auth.ts` | Create — BetterAuth server instance |
| `lib/auth-client.ts` | Create — BetterAuth React client |
| `lib/db.ts` | Create — Drizzle + Turso connection |
| `app/api/auth/[...all]/route.ts` | Create — Next.js handler |
| `components/AuthModal.tsx` | Create — full auth modal |
| `components/Navbar.tsx` | Update — add session hook + avatar |
| `convex/schema.ts` | Update — add `users` table |
| `convex/users.ts` | Create — `upsert` mutation |
| `.env.local` | Update — add 6 new env vars |
| `drizzle.config.ts` | Create — points to Turso, schema from BetterAuth CLI |

---

## 11. Migration Steps (one-time setup)

```bash
# 1. Install packages
npm install better-auth drizzle-orm @libsql/client
npm install -D drizzle-kit

# 2. Create Turso DB (if not already)
turso db create agentk-auth
turso db tokens create agentk-auth

# 3. Generate BetterAuth schema + apply to Turso
npx @better-auth/cli generate
npx drizzle-kit migrate

# 4. Deploy Convex with new users table
npx convex dev --once
```

---

## 12. Out of Scope

- Email verification codes (deferred)
- Password reset / forgot password flow (deferred)
- User settings / profile page (deferred)
- Sign-out UI (can be added to avatar dropdown later)
- Focus trap in modal (accessibility enhancement, deferred)
