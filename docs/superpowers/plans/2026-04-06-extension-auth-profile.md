# Extension Auth Gate & Profile Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auth-gate the AgentK Chrome extension with a website→extension session bridge, and add an inline profile section with username editing, password management, billing info, and account deletion.

**Architecture:** The website fires `window.postMessage` after login; the content script relays the session token to `chrome.storage`; the extension reads it on open and validates with a Convex HTTP action. Profile operations call new Convex mutations or the website's `/api/auth` proxy endpoint.

**Tech Stack:** Convex (mutations + HTTP actions), @convex-dev/auth, Next.js 15 App Router, Chrome Extension MV3 (vanilla JS / shadow DOM)

---

## File Map

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `extensionSessions` table |
| `convex/extensionAuth.ts` | Create — 3 mutations: `createExtensionSession`, `updateUsername`, `deleteAccount` |
| `convex/http.ts` | Add `GET /extensionUser` + `OPTIONS /extensionUser` |
| `components/AuthBridge.tsx` | Create — silent client component that fires postMessage after login |
| `app/providers.tsx` | Add `<AuthBridge />` inside `ConvexAuthNextjsProvider` |
| `components/Navbar.tsx` | Add `useEffect` for `?openLogin=true` query param |
| `chrome-extension/content.js` | Add message listener, auth check, auth gate, profile section, avatar update |

---

## Task 1: Add extensionSessions to Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the table**

Open `convex/schema.ts`. After the `twitterResults` table and before the closing `});`, add:

```ts
  extensionSessions: defineTable({
    token:     v.string(),
    userId:    v.id("users"),
    createdAt: v.number(),
  }).index("by_token", ["token"])
    .index("by_user",  ["userId"]),
```

The final `schema.ts` closing should look like:

```ts
  twitterResults: defineTable({
    // ... existing fields ...
  })
    .index("by_device",       ["deviceId"])
    .index("by_device_tweet", ["deviceId", "tweetId"]),

  extensionSessions: defineTable({
    token:     v.string(),
    userId:    v.id("users"),
    createdAt: v.number(),
  }).index("by_token", ["token"])
    .index("by_user",  ["userId"]),
});
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd d:/agentk && npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add extensionSessions table to Convex schema"
```

---

## Task 2: Create convex/extensionAuth.ts

**Files:**
- Create: `convex/extensionAuth.ts`

- [ ] **Step 1: Create the file**

```ts
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Called by the website after login.
 * Creates (or replaces) a long-lived extension session token for this user.
 * Returns the token + user info for the postMessage payload.
 */
export const createExtensionSession = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Determine auth method by checking authAccounts table.
    // authAccounts has index "userIdAndProvider" on ["userId", "provider"].
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    const authMethod = account?.provider === "google" ? "google" : "password";

    // Delete any existing session for this user (one session per user).
    const existing = await ctx.db
      .query("extensionSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);

    // Create new session.
    const token = crypto.randomUUID();
    await ctx.db.insert("extensionSessions", {
      token,
      userId,
      createdAt: Date.now(),
    });

    return {
      token,
      email: user.email ?? "",
      username: user.name ?? "",
      authMethod,
    };
  },
});

/**
 * Updates the authenticated user's display name (username).
 * Validates 3–20 chars, alphanumeric + underscore.
 */
export const updateUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new Error("Username must be 3–20 characters: letters, numbers, underscore only.");
    }

    await ctx.db.patch(userId, { name: username });
    return { ok: true };
  },
});

/**
 * Deletes the authenticated user's account and all associated data.
 * Removes: extensionSessions, then the user document itself.
 * (redditResults and twitterResults are keyed by deviceId, not userId —
 * they are left to expire naturally or be handled in a future cleanup job.)
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    // Delete extension sessions.
    const sessions = await ctx.db
      .query("extensionSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);

    // Delete auth accounts linked to this user.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);

    // Delete the user record.
    await ctx.db.delete(userId);

    return { ok: true };
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd d:/agentk && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add convex/extensionAuth.ts
git commit -m "feat: add createExtensionSession, updateUsername, deleteAccount mutations"
```

---

## Task 3: Add GET /extensionUser HTTP action to convex/http.ts

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Add the route before `export default http`**

In `convex/http.ts`, just before the final `export default http;` line, insert:

```ts
/* ── Extension Auth ── */
http.route({
  path: "/extensionUser",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const session = await ctx.runQuery(internal.extensionAuth.getSessionByToken, { token });

    if (!session) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify(session), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/extensionUser",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});
```

- [ ] **Step 2: Add the internal query to convex/extensionAuth.ts**

Append to `convex/extensionAuth.ts`:

```ts
import { internalQuery } from "./_generated/server";

/**
 * Internal query used by the /extensionUser HTTP action.
 * Returns { email, username, authMethod, plan } or null.
 */
export const getSessionByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("extensionSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!session) return null;

    const user = await ctx.db.get(session.userId);
    if (!user) return null;

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", session.userId))
      .first();
    const authMethod = account?.provider === "google" ? "google" : "password";

    return {
      email: user.email ?? "",
      username: user.name ?? "",
      authMethod,
      plan: "free",
    };
  },
});
```

Also update the import at the top of `convex/extensionAuth.ts` to include `internalQuery`:

```ts
import { mutation, internalQuery } from "./_generated/server";
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd d:/agentk && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Deploy Convex**

```bash
cd d:/agentk && npx convex dev --once
```

Expected: `✔ Convex functions ready!`

- [ ] **Step 5: Smoke-test the endpoint**

Create a session manually to test (replace TOKEN with an actual token from a logged-in user in the Convex dashboard, or skip until integration test in Task 8).

```bash
curl "https://savory-lynx-906.convex.site/extensionUser?token=invalid-token"
```

Expected: `{"error":"invalid token"}` with status 401.

- [ ] **Step 6: Commit**

```bash
git add convex/http.ts convex/extensionAuth.ts
git commit -m "feat: add /extensionUser HTTP action and getSessionByToken internal query"
```

---

## Task 4: Create AuthBridge website component

**Files:**
- Create: `components/AuthBridge.tsx`
- Modify: `app/providers.tsx`

- [ ] **Step 1: Create AuthBridge.tsx**

```tsx
"use client";

import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Silent component mounted inside Providers.
 * When the user logs in, creates an extension session token in Convex
 * and broadcasts it to any AgentK content script listening on this page.
 * Produces no visible output.
 */
export function AuthBridge() {
  const { isAuthenticated } = useConvexAuth();
  const createSession = useMutation(api.extensionAuth.createExtensionSession);

  useEffect(() => {
    if (!isAuthenticated) return;

    createSession()
      .then((session) => {
        window.postMessage(
          { type: "AGENTK_AUTH", ...session },
          window.location.origin,
        );
      })
      .catch((err) => {
        console.warn("[AgentK] AuthBridge: failed to create extension session", err);
      });
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
```

- [ ] **Step 2: Add AuthBridge to Providers**

In `app/providers.tsx`, import and render AuthBridge:

```tsx
"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { AuthBridge } from "@/components/AuthBridge";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <AuthBridge />
      {children}
    </ConvexAuthNextjsProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd d:/agentk && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Smoke-test**

Start the dev server (`npm run dev` + `npx convex dev` in parallel). Log in with Google or email. Open browser DevTools console on `localhost:3000`. You should see no errors. In the Network tab, confirm a POST to Convex for `extensionAuth:createExtensionSession` succeeded.

- [ ] **Step 5: Commit**

```bash
git add components/AuthBridge.tsx app/providers.tsx
git commit -m "feat: add AuthBridge to broadcast extension session token after login"
```

---

## Task 5: Add ?openLogin=true URL trigger to Navbar

**Files:**
- Modify: `components/Navbar.tsx`

The extension's login button opens `http://localhost:3000/?openLogin=true`. Navbar must detect this and auto-open the AuthModal.

- [ ] **Step 1: Add useEffect to Navbar.tsx**

In `components/Navbar.tsx`, add `useEffect` to the existing imports:

```tsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import logo from "@/app/logo.png";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AuthModal from "@/components/AuthModal";
```

Then inside the `Navbar` component, add this `useEffect` after the existing state/query declarations:

```tsx
// Auto-open auth modal when ?openLogin=true is in the URL.
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("openLogin") === "true") {
    setAuthOpen(true);
    // Clean up the query param without a page reload.
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
  }
}, []);
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd d:/agentk && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Smoke-test**

Navigate to `http://localhost:3000/?openLogin=true` in the browser. The auth modal should open immediately. The URL bar should update to `http://localhost:3000/` (param removed).

- [ ] **Step 4: Commit**

```bash
git add components/Navbar.tsx
git commit -m "feat: auto-open login modal when ?openLogin=true is in URL"
```

---

## Task 6: Extension — message listener

**Files:**
- Modify: `chrome-extension/content.js`

The content script must listen for `AGENTK_AUTH` messages from the website and store them in `chrome.storage.local`.

- [ ] **Step 1: Add message listener at the end of initStorage() call sequence**

In `content.js`, find the `chrome.runtime.onMessage.addListener` block (around line 1268). Just above it, add:

```js
  /* ─── Website → Extension auth bridge ─── */
  window.addEventListener("message", (event) => {
    // Only accept messages from the AgentK website.
    if (event.origin !== "http://localhost:3000") return;
    if (!event.data || event.data.type !== "AGENTK_AUTH") return;

    const { token, email, username, authMethod } = event.data;
    if (!token || !email) return;

    chrome.storage.local.set({
      agentKAuth: { token, email, username: username ?? "", authMethod: authMethod ?? "password" },
    });
    console.log("[agentK] Auth session stored from website.");
  });
```

- [ ] **Step 2: Reload the extension and verify**

1. Go to `chrome://extensions`, click the refresh icon on AgentK.
2. Open `http://localhost:3000` in a tab.
3. Log in (or already logged in — open DevTools Console on that tab and run):

```js
window.postMessage({ type: "AGENTK_AUTH", token: "test-token", email: "test@example.com", username: "tester", authMethod: "password" }, "http://localhost:3000");
```

4. In a new tab, open the extension. Check background script logs via `chrome://extensions` → AgentK → Service Worker → Console for any errors.
5. In the extension popup tab, in DevTools console:

```js
chrome.storage.local.get("agentKAuth", console.log);
```

Expected: `{ agentKAuth: { token: "test-token", email: "test@example.com", ... } }`

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add message listener to relay auth token from website to chrome.storage"
```

---

## Task 7: Extension — auth check + auth gate screen

**Files:**
- Modify: `chrome-extension/content.js`

The `mount()` function must check for a valid session before rendering the normal UI. If none, show a full-screen auth gate.

- [ ] **Step 1: Add auth gate CSS to the CSS string**

In `content.js`, find the `const CSS = \`...\`` string. Append the following before the closing backtick:

```css

    /* ── Auth Gate ── */
    .auth-gate {
      width: 100%;
      height: 100%;
      background: #FDF7EF;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 32px;
      text-align: center;
    }
    .auth-gate-logo {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -1px;
      color: #DF849D;
      line-height: 1;
    }
    .auth-gate-wordmark {
      font-size: 26px;
      font-weight: 800;
      color: #DF849D;
      letter-spacing: -1px;
      margin-bottom: 12px;
    }
    .auth-gate-msg {
      font-size: 14px;
      font-weight: 500;
      color: #191918;
      line-height: 1.4;
    }
    .auth-gate-sub {
      font-size: 13px;
      font-weight: 400;
      color: #3D3A36;
      margin-bottom: 20px;
    }
    .auth-gate-btn {
      padding: 10px 28px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .auth-gate-btn:hover { opacity: 0.88; }
```

- [ ] **Step 2: Add renderAuthGate() function**

After the `function unmount()` block, add:

```js
  function renderAuthGate(root) {
    root.innerHTML = `
      <div class="auth-gate">
        <div class="auth-gate-logo">aK</div>
        <div class="auth-gate-wordmark">agentK</div>
        <p class="auth-gate-msg">You are not logged in.</p>
        <p class="auth-gate-sub">Please log in to use AgentK.</p>
        <button class="auth-gate-btn" id="auth-gate-login-btn">Log in</button>
      </div>
    `;
    root.querySelector("#auth-gate-login-btn").addEventListener("click", () => {
      chrome.tabs.create({ url: "http://localhost:3000/?openLogin=true" });
    });
  }
```

- [ ] **Step 3: Modify mount() to check auth before rendering**

Replace the existing `async function mount()` with:

```js
  async function mount() {
    if (host?.isConnected) return;
    unmount();
    await initStorage();

    host = document.createElement("div");
    host.id = "agentk-host";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "agentk-overlay";
    overlay.addEventListener("click", unmount);

    const root = document.createElement("div");
    root.id = "agentk-root";
    root.addEventListener("click", (e) => e.stopPropagation());

    host.shadowRoot.appendChild(overlay);
    overlay.appendChild(root);

    document.addEventListener("keydown", onKeyDown);

    // ── Auth check ──
    const stored = await new Promise(resolve =>
      chrome.storage.local.get(["agentKAuth"], resolve)
    );

    if (!stored.agentKAuth?.token) {
      // No session — show auth gate.
      renderAuthGate(root);
      return;
    }

    // Validate token with Convex.
    let userData = null;
    try {
      const res = await fetch(
        `${CONVEX_SITE_URL}/extensionUser?token=${encodeURIComponent(stored.agentKAuth.token)}`
      );
      if (res.ok) {
        userData = await res.json();
        // Refresh storage with latest user info from server.
        chrome.storage.local.set({ agentKAuth: { ...stored.agentKAuth, ...userData } });
      } else {
        // Token invalid — clear and show gate.
        chrome.storage.local.remove("agentKAuth");
        renderAuthGate(root);
        return;
      }
    } catch (_) {
      // Network error — trust cached data, proceed with stored info.
      userData = stored.agentKAuth;
    }

    // ── Full UI ──
    renderInternal(root, shadow);

    // Trigger X pipeline on initial open if X tab is active and keywords exist.
    if (activeTab === 'x' && state.keywords.length) {
      const xStored = await new Promise(resolve =>
        chrome.storage.local.get(['xLastFetchAt'], resolve)
      );
      const shouldFetch = (Date.now() - (xStored.xLastFetchAt || 0)) > 12 * 60 * 60 * 1000;
      if (shouldFetch) await fetchXPipeline();
      await renderFromXStorage(shadow);
    }
  }
```

- [ ] **Step 4: Reload extension and test**

1. Go to `chrome://extensions`, reload AgentK.
2. Clear `agentKAuth` from storage by opening a page and running in console: `chrome.storage.local.remove("agentKAuth")`.
3. Click the AgentK extension icon. Expected: auth gate screen (logo, "You are not logged in.", login button).
4. Click "Log in". Expected: new tab opens `http://localhost:3000/?openLogin=true` with login modal open.
5. Log in on the website. The `AuthBridge` fires `postMessage` which is caught by the content script, storing the token.
6. Click AgentK icon again. Expected: full UI loads.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: auth gate in extension — checks session before rendering UI"
```

---

## Task 8: Extension — session-aware avatar in sidebar

**Files:**
- Modify: `chrome-extension/content.js`

The `.profile-avatar` div must show the user's email initial and open the profile section on click.

- [ ] **Step 1: Add avatar CSS to the CSS string**

In the CSS string, find `.profile-avatar { ... }` and replace it with:

```css
    .profile-avatar {
      width: 32px;
      height: 32px;
      background-color: #DF849D;
      border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: outline 0.15s;
      user-select: none;
    }
    .profile-avatar:hover {
      outline: 2px solid #DF849D;
      outline-offset: 2px;
    }
    .profile-avatar.active {
      outline: 2px solid #DF849D;
      outline-offset: 2px;
    }
```

- [ ] **Step 2: Thread agentKAuth into renderInternal**

`renderInternal` needs to know the current user. Add a module-level variable near the top of the IIFE (after `let activeTab = 'x';`):

```js
  let currentUser = null; // { email, username, authMethod, plan, token } — set after auth check
```

In the `mount()` function, after `userData` is resolved (either from server or storage), add:

```js
    currentUser = { ...stored.agentKAuth, ...userData };
```

Place this line right before `renderInternal(root, shadow);`.

- [ ] **Step 3: Update the profile-avatar in renderInternal**

In `renderInternal`, find:

```js
        <div class="sidebar-bottom">
          <div class="profile-avatar"></div>
        </div>
```

Replace with:

```js
        <div class="sidebar-bottom">
          <div class="profile-avatar ${activeTab === 'profile' ? 'active' : ''}" id="sidebar-avatar" title="${currentUser?.email ?? ''}">
            ${(currentUser?.email ?? '?').charAt(0).toUpperCase()}
          </div>
        </div>
```

- [ ] **Step 4: Bind avatar click in bindTabSwitching**

At the end of `bindTabSwitching`, add:

```js
    const avatar = shadow.getElementById("sidebar-avatar");
    if (avatar) {
      avatar.addEventListener("click", () => {
        activeTab = "profile";
        renderInternal(root, shadow);
      });
    }
```

- [ ] **Step 5: Add profile section placeholder to renderInternal**

In `renderInternal`, inside `<main class="content">`, add the profile section div after the settings section:

```js
        <div id="section-profile" class="section ${activeTab === 'profile' ? 'active' : ''}">
          ${profileHTML()}
        </div>
```

Define `profileHTML()` as a stub for now (full implementation in Task 9):

```js
  function profileHTML() {
    return `<div style="padding:40px 32px;"><p style="color:#B2A28C;font-size:13px;">Loading profile…</p></div>`;
  }
```

- [ ] **Step 6: Reload extension and verify avatar**

1. Reload extension in `chrome://extensions`.
2. Open extension (logged in). Sidebar bottom should show a pink circle with the first letter of your email.
3. Click the avatar. Main content area should switch to the profile stub ("Loading profile…").

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: session-aware avatar in sidebar, routes to profile section"
```

---

## Task 9: Extension — full profile section

**Files:**
- Modify: `chrome-extension/content.js`

Replace the profile stub with the full profile section: user info, username editing, password management, billing, and account deletion.

- [ ] **Step 1: Add profile section CSS to the CSS string**

Append to the CSS string:

```css

    /* ── Profile Section ── */
    .profile-section { padding: 32px 28px; overflow-y: auto; height: 100%; }
    .profile-heading { font-size: 18px; font-weight: 800; color: #191918; letter-spacing: -0.5px; margin-bottom: 20px; }
    .profile-user-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .profile-user-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: #DF849D; color: #fff; font-size: 16px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .profile-user-email { font-size: 13px; color: #3D3A36; font-weight: 500; word-break: break-all; }
    .profile-auth-badge {
      display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase; padding: 2px 8px; border-radius: 20px; margin-top: 4px;
    }
    .badge-google { background: #E8F0FE; color: #4285F4; }
    .badge-password { background: #F0F0EE; color: #62584F; }

    .profile-block { margin-bottom: 20px; }
    .profile-block-label {
      font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: #B2A28C; margin-bottom: 8px; display: block;
    }
    .profile-block-value { font-size: 13px; color: #191918; font-weight: 500; }
    .profile-edit-row { display: flex; align-items: center; gap: 8px; }
    .profile-edit-btn {
      background: none; border: none; cursor: pointer; color: #B2A28C;
      display: flex; align-items: center; padding: 2px; transition: color 0.15s;
    }
    .profile-edit-btn:hover { color: #DF849D; }
    .profile-input {
      width: 100%; padding: 8px 12px; border: 1px solid rgba(0,0,0,0.12);
      border-radius: 8px; font-size: 13px; color: #191918; outline: none;
      background: #fff; font-family: inherit;
      transition: border-color 0.15s;
    }
    .profile-input:focus { border-color: #DF849D; }
    .profile-action-row { display: flex; gap: 8px; margin-top: 8px; }
    .profile-save-btn {
      padding: 6px 14px; border: none; border-radius: 8px;
      background: linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%);
      color: #fff; font-size: 12px; font-weight: 700; cursor: pointer;
      transition: opacity 0.15s;
    }
    .profile-save-btn:hover { opacity: 0.88; }
    .profile-cancel-btn {
      padding: 6px 14px; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
      background: #fff; color: #62584F; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: background 0.15s;
    }
    .profile-cancel-btn:hover { background: #F5F0EA; }
    .profile-inline-error { font-size: 11px; color: #E53E3E; margin-top: 4px; }
    .profile-inline-success { font-size: 11px; color: #38A169; margin-top: 4px; }

    .profile-pw-sub { font-size: 11px; color: #B2A28C; margin-bottom: 8px; }
    .profile-text-btn {
      background: none; border: none; cursor: pointer; font-size: 13px;
      font-weight: 600; color: #DF849D; padding: 0; text-decoration: underline;
      font-family: inherit;
    }
    .profile-pw-dots { font-size: 14px; color: #191918; letter-spacing: 2px; }

    .profile-divider { height: 1px; background: rgba(0,0,0,0.07); margin: 20px 0; }
    .profile-plan-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .plan-badge {
      display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase; padding: 2px 8px; border-radius: 20px;
    }
    .plan-free { background: #F0F0EE; color: #62584F; }
    .plan-pro { background: #FDE8EE; color: #DF849D; }
    .plan-ultra { background: #191918; color: #fff; }
    .profile-plan-tagline { font-size: 11px; color: #B2A28C; }
    .profile-link-btn {
      font-size: 12px; font-weight: 600; color: #DF849D; text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
    }
    .profile-link-btn:hover { text-decoration: underline; }
    .profile-invoice-empty { font-size: 12px; color: #B2A28C; margin-top: 8px; }

    .danger-zone { margin-top: 4px; }
    .danger-link {
      background: none; border: none; cursor: pointer; font-size: 12px;
      color: #B2A28C; padding: 0; font-family: inherit; transition: color 0.2s;
    }
    .danger-link:hover { color: #E53E3E; }
    .danger-confirm { margin-top: 10px; }
    .danger-confirm-msg { font-size: 12px; color: #3D3A36; margin-bottom: 8px; line-height: 1.5; }
    .danger-delete-btn {
      padding: 6px 14px; border: none; border-radius: 8px;
      background: #E53E3E; color: #fff; font-size: 12px; font-weight: 700;
      cursor: pointer; margin-right: 8px; transition: opacity 0.15s;
    }
    .danger-delete-btn:hover { opacity: 0.85; }

    .profile-pw-input-wrap { position: relative; margin-bottom: 8px; }
    .profile-pw-eye {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; color: #B2A28C;
      display: flex; align-items: center; padding: 0;
    }
    .profile-pw-eye:hover { color: #191918; }
```

- [ ] **Step 2: Replace profileHTML() with full implementation**

Replace the stub `function profileHTML()` with:

```js
  function profileHTML() {
    const u = currentUser ?? {};
    const initial = (u.email ?? '?').charAt(0).toUpperCase();
    const isGoogle = u.authMethod === 'google';
    const plan = u.plan ?? 'free';
    const planClass = plan === 'ultra' ? 'plan-ultra' : plan === 'pro' ? 'plan-pro' : 'plan-free';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

    return `
      <div class="profile-section">
        <h2 class="profile-heading">Profile</h2>

        <div class="profile-user-row">
          <div class="profile-user-avatar">${initial}</div>
          <div>
            <div class="profile-user-email">${u.email ?? ''}</div>
            <span class="profile-auth-badge ${isGoogle ? 'badge-google' : 'badge-password'}">
              ${isGoogle ? 'Google' : 'Email'}
            </span>
          </div>
        </div>

        <!-- Username -->
        <div class="profile-block" id="profile-username-block">
          <span class="profile-block-label">Username</span>
          <div class="profile-edit-row" id="username-display-row">
            <span class="profile-block-value" id="username-display">${u.username ?? ''}</span>
            <button class="profile-edit-btn" id="username-edit-btn" title="Edit username">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
          <div id="username-edit-form" style="display:none;">
            <input type="text" class="profile-input" id="username-input" value="${u.username ?? ''}" maxlength="20" placeholder="3–20 chars, letters, numbers, underscore" />
            <div class="profile-action-row">
              <button class="profile-save-btn" id="username-save-btn">Save</button>
              <button class="profile-cancel-btn" id="username-cancel-btn">Cancel</button>
            </div>
            <p class="profile-inline-error" id="username-error" style="display:none;"></p>
            <p class="profile-inline-success" id="username-success" style="display:none;">Username updated!</p>
          </div>
        </div>

        <!-- Password -->
        <div class="profile-block" id="profile-password-block">
          <span class="profile-block-label">Password</span>
          ${isGoogle ? `
            <p class="profile-pw-sub">Set a password to enable email login.</p>
            <button class="profile-text-btn" id="pw-set-btn">Set password</button>
            <div id="pw-set-form" style="display:none;margin-top:10px;">
              <div class="profile-pw-input-wrap">
                <input type="password" class="profile-input" id="pw-new-input" placeholder="New password (min 8 chars)" style="padding-right:36px;" />
                <button class="profile-pw-eye" id="pw-new-eye" type="button">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <div class="profile-action-row">
                <button class="profile-save-btn" id="pw-set-save-btn">Save</button>
                <button class="profile-cancel-btn" id="pw-set-cancel-btn">Cancel</button>
              </div>
              <p class="profile-inline-error" id="pw-set-error" style="display:none;"></p>
              <p class="profile-inline-success" id="pw-set-success" style="display:none;">Password set!</p>
            </div>
          ` : `
            <div class="profile-edit-row">
              <span class="profile-pw-dots">••••••••</span>
              <button class="profile-text-btn" id="pw-change-btn">Change</button>
            </div>
            <div id="pw-change-form" style="display:none;margin-top:10px;">
              <div class="profile-pw-input-wrap">
                <input type="password" class="profile-input" id="pw-current-input" placeholder="Current password" style="padding-right:36px;margin-bottom:8px;" />
                <button class="profile-pw-eye" id="pw-current-eye" type="button">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <div class="profile-pw-input-wrap">
                <input type="password" class="profile-input" id="pw-new-input" placeholder="New password (min 8 chars)" style="padding-right:36px;" />
                <button class="profile-pw-eye" id="pw-new-eye" type="button">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <div class="profile-action-row">
                <button class="profile-save-btn" id="pw-change-save-btn">Save</button>
                <button class="profile-cancel-btn" id="pw-change-cancel-btn">Cancel</button>
              </div>
              <p class="profile-inline-error" id="pw-change-error" style="display:none;"></p>
              <p class="profile-inline-success" id="pw-change-success" style="display:none;">Password changed!</p>
            </div>
          `}
        </div>

        <div class="profile-divider"></div>

        <!-- Billing -->
        <div class="profile-block">
          <span class="profile-block-label">Billing</span>
          <div class="profile-plan-row">
            <span class="plan-badge ${planClass}">${planLabel}</span>
          </div>
          <p class="profile-plan-tagline">${planLabel} plan</p>
          <a href="http://localhost:3000/#pricing" target="_blank" class="profile-link-btn">
            Manage billing →
          </a>
          <p class="profile-invoice-empty">No invoices yet.</p>
        </div>

        <div class="profile-divider"></div>

        <!-- Danger zone -->
        <div class="danger-zone">
          <button class="danger-link" id="delete-account-btn">Delete account</button>
          <div class="danger-confirm" id="delete-confirm" style="display:none;">
            <p class="danger-confirm-msg">This will permanently delete your account and all data. This cannot be undone.</p>
            <button class="danger-delete-btn" id="delete-confirm-btn">Yes, delete</button>
            <button class="profile-cancel-btn" id="delete-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
```

- [ ] **Step 3: Add bindProfileEvents() function**

After `function bindSettingsEvents(shadow)`, add:

```js
  function bindProfileEvents(shadow) {
    const CONVEX_CLOUD = CONVEX_CLOUD_URL;

    /* ── Username editing ── */
    const editBtn    = shadow.getElementById("username-edit-btn");
    const displayRow = shadow.getElementById("username-display-row");
    const editForm   = shadow.getElementById("username-edit-form");
    const inputEl    = shadow.getElementById("username-input");
    const saveBtn    = shadow.getElementById("username-save-btn");
    const cancelBtn  = shadow.getElementById("username-cancel-btn");
    const errorEl    = shadow.getElementById("username-error");
    const successEl  = shadow.getElementById("username-success");

    if (editBtn) {
      editBtn.addEventListener("click", () => {
        displayRow.style.display = "none";
        editForm.style.display = "block";
        inputEl?.focus();
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        displayRow.style.display = "flex";
        editForm.style.display = "none";
        errorEl.style.display = "none";
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const val = inputEl.value.trim();
        errorEl.style.display = "none";
        successEl.style.display = "none";

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(val)) {
          errorEl.textContent = "3–20 chars: letters, numbers, underscore only.";
          errorEl.style.display = "block";
          return;
        }

        saveBtn.disabled = true;
        try {
          const stored = await new Promise(resolve => chrome.storage.local.get(["agentKAuth"], resolve));
          const token = stored.agentKAuth?.token;
          if (!token) throw new Error("Not authenticated");

          // Call Convex mutation via the HTTP query API using the extension session token
          // as a custom header validated on the backend.
          // Because standard Convex auth requires a JWT, we use a small HTTP action approach:
          // POST to /updateUsername with { token, username }.
          const res = await fetch(`${CONVEX_SITE_URL}/updateUsername`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token, username: val }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error ?? "Failed to update username");
          }

          // Update local cache.
          currentUser = { ...currentUser, username: val };
          chrome.storage.local.set({ agentKAuth: { ...stored.agentKAuth, username: val } });

          shadow.getElementById("username-display").textContent = val;
          displayRow.style.display = "flex";
          editForm.style.display = "none";
          successEl.style.display = "block";
          setTimeout(() => { successEl.style.display = "none"; }, 2500);
        } catch (err) {
          errorEl.textContent = err.message ?? "Error saving username.";
          errorEl.style.display = "block";
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    /* ── Eye toggles (reusable helper) ── */
    function bindEyeToggle(eyeId, inputId) {
      const eye = shadow.getElementById(eyeId);
      const inp = shadow.getElementById(inputId);
      if (!eye || !inp) return;
      eye.addEventListener("click", () => {
        const isText = inp.type === "text";
        inp.type = isText ? "password" : "text";
        eye.innerHTML = isText
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      });
    }

    /* ── Set password (Google users) ── */
    const pwSetBtn    = shadow.getElementById("pw-set-btn");
    const pwSetForm   = shadow.getElementById("pw-set-form");
    const pwSetCancel = shadow.getElementById("pw-set-cancel-btn");
    const pwSetSave   = shadow.getElementById("pw-set-save-btn");
    const pwSetError  = shadow.getElementById("pw-set-error");
    const pwSetOk     = shadow.getElementById("pw-set-success");

    if (pwSetBtn) {
      bindEyeToggle("pw-new-eye", "pw-new-input");
      pwSetBtn.addEventListener("click", () => { pwSetForm.style.display = "block"; });
      pwSetCancel?.addEventListener("click", () => {
        pwSetForm.style.display = "none";
        pwSetError.style.display = "none";
      });
      pwSetSave?.addEventListener("click", async () => {
        const newPw = shadow.getElementById("pw-new-input")?.value ?? "";
        pwSetError.style.display = "none";
        pwSetOk.style.display = "none";
        if (newPw.length < 8) {
          pwSetError.textContent = "Password must be at least 8 characters.";
          pwSetError.style.display = "block";
          return;
        }
        pwSetSave.disabled = true;
        try {
          const fd = new FormData();
          fd.set("email", currentUser?.email ?? "");
          fd.set("password", newPw);
          fd.set("flow", "signUp");
          const res = await fetch("http://localhost:3000/api/auth", { method: "POST", body: fd, credentials: "include" });
          if (!res.ok) throw new Error("Failed to set password");
          pwSetForm.style.display = "none";
          pwSetBtn.style.display = "none";
          pwSetOk.style.display = "block";
          setTimeout(() => { pwSetOk.style.display = "none"; }, 2500);
        } catch (err) {
          pwSetError.textContent = err.message ?? "Error setting password.";
          pwSetError.style.display = "block";
        } finally {
          pwSetSave.disabled = false;
        }
      });
    }

    /* ── Change password (email users) ── */
    const pwChangeBtn    = shadow.getElementById("pw-change-btn");
    const pwChangeForm   = shadow.getElementById("pw-change-form");
    const pwChangeCancel = shadow.getElementById("pw-change-cancel-btn");
    const pwChangeSave   = shadow.getElementById("pw-change-save-btn");
    const pwChangeError  = shadow.getElementById("pw-change-error");
    const pwChangeOk     = shadow.getElementById("pw-change-success");

    if (pwChangeBtn) {
      bindEyeToggle("pw-current-eye", "pw-current-input");
      bindEyeToggle("pw-new-eye", "pw-new-input");
      pwChangeBtn.addEventListener("click", () => { pwChangeForm.style.display = "block"; });
      pwChangeCancel?.addEventListener("click", () => {
        pwChangeForm.style.display = "none";
        pwChangeError.style.display = "none";
      });
      pwChangeSave?.addEventListener("click", async () => {
        const curPw = shadow.getElementById("pw-current-input")?.value ?? "";
        const newPw = shadow.getElementById("pw-new-input")?.value ?? "";
        pwChangeError.style.display = "none";
        pwChangeOk.style.display = "none";
        if (newPw.length < 8) {
          pwChangeError.textContent = "New password must be at least 8 characters.";
          pwChangeError.style.display = "block";
          return;
        }
        pwChangeSave.disabled = true;
        try {
          // Sign in with current password to verify, then sign up with new.
          const fd = new FormData();
          fd.set("email", currentUser?.email ?? "");
          fd.set("password", curPw);
          fd.set("flow", "signIn");
          const verifyRes = await fetch("http://localhost:3000/api/auth", { method: "POST", body: fd, credentials: "include" });
          if (!verifyRes.ok) throw new Error("Current password is incorrect.");

          const fd2 = new FormData();
          fd2.set("email", currentUser?.email ?? "");
          fd2.set("password", newPw);
          fd2.set("flow", "signUp");
          const changeRes = await fetch("http://localhost:3000/api/auth", { method: "POST", body: fd2, credentials: "include" });
          if (!changeRes.ok) throw new Error("Failed to update password.");

          pwChangeForm.style.display = "none";
          pwChangeOk.style.display = "block";
          setTimeout(() => { pwChangeOk.style.display = "none"; }, 2500);
        } catch (err) {
          pwChangeError.textContent = err.message ?? "Error changing password.";
          pwChangeError.style.display = "block";
        } finally {
          pwChangeSave.disabled = false;
        }
      });
    }

    /* ── Delete account ── */
    const deleteBtn     = shadow.getElementById("delete-account-btn");
    const deleteConfirm = shadow.getElementById("delete-confirm");
    const deleteYesBtn  = shadow.getElementById("delete-confirm-btn");
    const deleteCancelBtn = shadow.getElementById("delete-cancel-btn");

    deleteBtn?.addEventListener("click", () => {
      deleteConfirm.style.display = "block";
    });
    deleteCancelBtn?.addEventListener("click", () => {
      deleteConfirm.style.display = "none";
    });
    deleteYesBtn?.addEventListener("click", async () => {
      deleteYesBtn.disabled = true;
      deleteYesBtn.textContent = "Deleting…";
      try {
        const stored = await new Promise(resolve => chrome.storage.local.get(["agentKAuth"], resolve));
        const token = stored.agentKAuth?.token;
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(`${CONVEX_SITE_URL}/deleteAccount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) throw new Error("Deletion failed");

        chrome.storage.local.remove("agentKAuth");
        currentUser = null;
        unmount();
      } catch (err) {
        deleteYesBtn.disabled = false;
        deleteYesBtn.textContent = "Yes, delete";
        deleteConfirm.insertAdjacentHTML("beforeend",
          `<p class="profile-inline-error" style="margin-top:6px;">${err.message}</p>`
        );
      }
    });
  }
```

- [ ] **Step 4: Wire bindProfileEvents into renderInternal**

In `renderInternal`, after `if (activeTab === 'settings') bindSettingsEvents(shadow);`, add:

```js
    if (activeTab === 'profile') bindProfileEvents(shadow);
```

- [ ] **Step 5: Add /updateUsername and /deleteAccount HTTP actions to convex/http.ts**

The profile section calls `${CONVEX_SITE_URL}/updateUsername` and `${CONVEX_SITE_URL}/deleteAccount` with the extension session token. Add these two HTTP actions to `convex/http.ts` before `export default http;`:

```ts
/* ── Extension Profile Operations ── */
http.route({
  path: "/updateUsername",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { token, username } = await request.json();
    if (!token || !username) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    try {
      await ctx.runMutation(internal.extensionAuth.updateUsernameByToken, { token, username });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400, headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/updateUsername",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  })),
});

http.route({
  path: "/deleteAccount",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { token } = await request.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400, headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    try {
      await ctx.runMutation(internal.extensionAuth.deleteAccountByToken, { token });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400, headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/deleteAccount",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  })),
});
```

- [ ] **Step 6: Add token-based internal mutations to convex/extensionAuth.ts**

Append to `convex/extensionAuth.ts`:

```ts
/**
 * Token-based username update called by the /updateUsername HTTP action.
 * Looks up the session token to find the userId, then patches the user.
 */
export const updateUsernameByToken = internalMutation({
  args: { token: v.string(), username: v.string() },
  handler: async (ctx, { token, username }) => {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new Error("Username must be 3–20 characters: letters, numbers, underscore only.");
    }
    const session = await ctx.db
      .query("extensionSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!session) throw new Error("Invalid session token");
    await ctx.db.patch(session.userId, { name: username });
  },
});

/**
 * Token-based account deletion called by the /deleteAccount HTTP action.
 */
export const deleteAccountByToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("extensionSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!session) throw new Error("Invalid session token");

    const userId = session.userId;

    // Delete all extension sessions.
    const allSessions = await ctx.db
      .query("extensionSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const s of allSessions) await ctx.db.delete(s._id);

    // Delete auth accounts.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);

    // Delete user record.
    await ctx.db.delete(userId);
  },
});
```

Also update the import line at the top of `convex/extensionAuth.ts`:

```ts
import { mutation, internalQuery, internalMutation } from "./_generated/server";
```

- [ ] **Step 7: Deploy Convex**

```bash
cd d:/agentk && npx convex dev --once
```

Expected: `✔ Convex functions ready!`

- [ ] **Step 8: Reload extension and test profile section end to end**

1. Reload extension in `chrome://extensions`.
2. Log in on website if not already.
3. Open extension. Click avatar. Profile section loads.
4. **Test username edit:** Click pencil → type new valid username → Save. Display name updates.
5. **Test username validation:** Try entering `a` (too short) → error appears.
6. **Test billing block:** "Manage billing →" link opens website. "No invoices yet." shown.
7. **Test delete account:** Click "Delete account" → confirmation appears → "Cancel" hides it. (Do NOT click "Yes, delete" unless testing on a disposable account.)

- [ ] **Step 9: Commit**

```bash
git add chrome-extension/content.js convex/http.ts convex/extensionAuth.ts
git commit -m "feat: full profile section in extension with username edit, password, billing, delete account"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Auth gate screen (no sidebar, logo, message, login button → `?openLogin=true`)
- ✅ Session bridge (postMessage → chrome.storage → Convex validate on open)
- ✅ Session-aware avatar (email initial, pink, click → profile section)
- ✅ Profile section in content area (same pattern as X/Reddit/Settings)
- ✅ Email display + auth method badge
- ✅ Username inline edit with validation
- ✅ Password: conditional Google vs email flow, eye toggle, inline errors
- ✅ Billing: plan badge (default free), manage link, "No invoices yet"
- ✅ Delete account: inline confirm, no modal, clear but not aggressive
- ✅ `?openLogin=true` URL trigger on website

**Known implementation note — password change flow:**
The `changePassword` flow via `POST /api/auth` uses `flow: "signIn"` to verify then `flow: "signUp"` with the new password. This works if @convex-dev/auth Password provider accepts a new signUp for an existing email as a credential update. If it rejects duplicate emails, the password change form should display the error gracefully. Test this during Task 9 Step 8.
