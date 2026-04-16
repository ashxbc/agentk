# AgentK Extension — Auth Gate & Profile Integration
**Date:** 2026-04-06
**Stack:** Chrome Extension (MV3, vanilla JS) · Convex · @convex-dev/auth · Next.js 15
**Scope:** Auth-gated extension popup, website→extension session bridge, inline profile/billing section

---

## 1. Architecture Overview

```
Website (Next.js)
  └─ AuthModal / useEffect watching isAuthenticated
  └─ Calls Convex mutation: createExtensionSession()
  └─ window.postMessage({ type: "AGENTK_AUTH", token, email, username, authMethod })

Content script (content.js) — injected on all pages
  └─ Listens for window message, validates origin
  └─ chrome.storage.local.set({ agentKAuth: { token, email, username, authMethod } })

Extension popup (content.js)
  └─ On open: reads chrome.storage.local["agentKAuth"]
  └─ Missing → renders auth gate screen
  └─ Present → renders full UI, uses stored user info
  └─ Calls Convex HTTP action GET /extensionUser?token=xxx on open to re-validate

Convex backend
  └─ extensionSessions table: { token, userId, createdAt }
  └─ createExtensionSession mutation (authenticated)
  └─ GET /extensionUser HTTP action (token-validated)
  └─ updateUsername, setPassword, updatePassword, deleteAccount mutations
```

---

## 2. Convex Backend Changes

### 2a. Schema addition — `extensionSessions` table

```ts
// convex/schema.ts
extensionSessions: defineTable({
  token:     v.string(),
  userId:    v.id("users"),
  createdAt: v.number(),
}).index("by_token", ["token"]),
```

### 2b. New mutations — `convex/extensionAuth.ts`

**`createExtensionSession`** (authenticated mutation)
- Calls `getAuthUserId(ctx)` — returns null if not logged in
- Checks for existing session for this userId — if found, deletes it first (one session per user)
- Queries `accounts` table (from authTables) by userId to determine `authMethod`: `"google"` if provider is `"google"`, `"password"` otherwise
- Generates `crypto.randomUUID()` as token
- Inserts into `extensionSessions`
- Returns `{ token, email: user.email, username: user.name, authMethod }`

**`updateUsername`** (authenticated mutation)
- Args: `{ username: v.string() }`
- Validates: 3–20 chars, alphanumeric + underscore
- Updates user record in `users` table (authTables user)

**`setPassword`** (for Google-auth users with no password)
- Not a direct Convex mutation — @convex-dev/auth handles password linking through its `signIn` action with `flow: "linkCredential"`
- The extension calls the website's `/api/auth` endpoint (via the middleware proxy) with the user's email + new password + flow type
- The extension's password form POSTs to `http://localhost:3000/api/auth` — same endpoint the website's AuthModal uses
- Validates client-side: min 8 chars before submission

**`updatePassword`** (for email-auth users)
- Same mechanism: POST to `/api/auth` with `flow: "changePassword"`, current password, new password
- @convex-dev/auth handles credential validation server-side

**`deleteAccount`** (authenticated mutation)
- Deletes user's extensionSessions records
- Deletes user's redditResults and twitterResults records
- Deletes the user record itself (cascades auth tables via @convex-dev/auth)

### 2c. New HTTP action — `convex/http.ts` addition

**`GET /extensionUser`**
- Query param: `?token=xxx`
- Looks up `extensionSessions` by token index
- If not found → 401 JSON response
- If found → fetches user record, returns `{ email, username, authMethod, plan: "free" }`

---

## 3. Website Changes

### 3a. Session bridge — `components/AuthBridge.tsx` (new client component)

A silent component mounted once in layout (or inside `Providers`). Watches `isAuthenticated` from `useConvexAuth()`. When it flips to `true`, calls `createExtensionSession` mutation and fires `window.postMessage`.

```tsx
"use client";
// Watches auth state. When authenticated, creates extension session and posts to content script.
// Rendered inside Providers in app/layout.tsx — produces no visible output.
export function AuthBridge() {
  const { isAuthenticated } = useConvexAuth();
  const createSession = useMutation(api.extensionAuth.createExtensionSession);

  useEffect(() => {
    if (!isAuthenticated) return;
    createSession().then((session) => {
      window.postMessage({ type: "AGENTK_AUTH", ...session }, window.location.origin);
    });
  }, [isAuthenticated]);

  return null;
}
```

### 3b. Layout update — `app/layout.tsx`

Add `<AuthBridge />` inside `<Providers>` (no visual impact).

---

## 4. Content Script Changes — `chrome-extension/content.js`

### 4a. Message listener (added at init)

```js
window.addEventListener("message", (event) => {
  if (event.origin !== "http://localhost:3000") return; // update for production
  if (event.data?.type !== "AGENTK_AUTH") return;
  const { token, email, username, authMethod } = event.data;
  chrome.storage.local.set({ agentKAuth: { token, email, username, authMethod } });
});
```

### 4b. Auth check on popup open

At the start of the popup render function (before building any UI), read `agentKAuth` from `chrome.storage.local`:
- If missing → render auth gate screen instead of normal UI
- If present → proceed with normal UI, pass user info to profile section and avatar

Re-validate against Convex `GET /extensionUser?token=xxx` on each open. If 401 → clear storage, show auth gate.

---

## 5. Auth Gate Screen

Shown when no valid session exists. Replaces the entire popup UI.

**Layout:**
- Full `420×560px` popup, `background: var(--bg-cream)` (`#FDF7EF`)
- Centered vertically and horizontally (flex column, gap 16px)
- No sidebar, no nav — clean blank slate

**Elements:**
1. AgentK logo mark (`aK` in accent pink, same style as `.brand-logo`)
2. Wordmark: `agentK` in Dancing Script or Inter 800, accent pink
3. Message: `"You are not logged in."` — `var(--text-dark)`, Inter 500, 14px
4. Sub-message: `"Please log in to use AgentK."` — `var(--text-medium)`, Inter 400, 13px
5. Login button — brand gradient (`#FF9A8B → #DF849D`), white text, `border-radius: 10px`, `padding: 10px 28px`
   - On click: `chrome.tabs.create({ url: "http://localhost:3000/?openLogin=true" })` (production: real domain)

**No other UI visible** in this state — sidebar, nav, and content are not rendered.

---

## 6. Avatar & Session-Aware Sidebar

Once logged in, the `.profile-avatar` in the sidebar bottom:
- Renders the first letter of the user's email, uppercase
- Background: `var(--accent-pink)` (`#DF849D`), white text, Inter 700, 13px
- On click → navigates to the profile section (sets `activeTab = "profile"`)
- Active state: outline ring `2px solid var(--accent-pink)` with `2px offset`

---

## 7. Profile Section (Content Area)

Activated when `activeTab === "profile"`. Rendered in the same `.content` area as X feed, Reddit, Settings. Sidebar remains visible.

### Layout structure (top to bottom, scrollable):

**Header**
- `"Profile"` — editorial heading, same style as other section headings
- First letter avatar + email, read-only, `var(--text-medium)` small text below heading
- Auth method badge: `Google` (blue-ish pill) or `Email` (neutral pill)

**Username block**
- Label: `"Username"`
- Inline edit: shows current username with a pencil icon button
- On click → input field appears in place, Save / Cancel buttons
- Validation: 3–20 chars, alphanumeric + underscore, inline error below field

**Password block** (conditional)
- If `authMethod === "google"` and no password set:
  - Label: `"Password"`, sub-text: `"Set a password to enable email login"`
  - `"Set password"` button → inline form: new password input (min 8, eye toggle) + Save
- If `authMethod === "password"` or password already set:
  - Label: `"Password"`, value shown as `••••••••`
  - `"Change password"` button → inline form: current password + new password (both with eye toggles) + Save

**Billing block**
- Section label: `"Billing"`
- Current plan badge: `Free` pill (neutral), `Pro` (accent pink), `Ultra` (dark)
- Plan name + tagline: e.g. `"Free plan — monitoring up to 2 keywords"`
- `"Manage billing →"` link → opens website billing page in new tab
- Invoice list: placeholder text `"No invoices yet."` (no data today)

**Danger zone**
- Subtle separator line
- `"Delete account"` — text link, `var(--text-light)` by default, transitions to `#E53E3E` on hover
- On click → inline confirmation: `"This will permanently delete your account and all data."` + `"Yes, delete"` (red) / `"Cancel"` buttons
- No modal — confirmation appears inline below the link

---

## 8. Manifest Changes — `manifest.json`

Add `"cookies"` permission is **not needed** (we use `chrome.storage`, not cookie reading).

No new permissions required beyond what already exists (`storage` is already listed).

For production, add the production domain to the `host_permissions` if not already covered by `<all_urls>`.

---

## 9. Website — Login Modal Trigger via URL

Website reads `?openLogin=true` query param on load and auto-opens the `AuthModal`.

Add to the root page component or a layout-level `useEffect`:
```tsx
const searchParams = useSearchParams();
useEffect(() => {
  if (searchParams.get("openLogin") === "true") {
    setAuthOpen(true);
  }
}, []);
```

---

## 10. File Checklist

| File | Action |
|------|--------|
| `convex/schema.ts` | Add `extensionSessions` table |
| `convex/extensionAuth.ts` | Create — `createExtensionSession`, `updateUsername`, `setPassword`, `updatePassword`, `deleteAccount` |
| `convex/http.ts` | Add `GET /extensionUser` HTTP action |
| `components/AuthBridge.tsx` | Create — silent session bridge component |
| `app/layout.tsx` | Add `<AuthBridge />` inside Providers |
| `app/page.tsx` (or layout) | Add `?openLogin=true` query param handler |
| `chrome-extension/content.js` | Add message listener, auth check on open, auth gate screen, profile section |
| `chrome-extension/popup.css` | Add auth gate styles, profile section styles, avatar styles |

---

## 11. Out of Scope

- Real-time extension unlock when user logs in (user navigates back manually for now)
- Plan enforcement / feature gating by plan tier (plan defaults to Free, no rules applied)
- Invoice data (placeholder only)
- Password reset / forgot password from extension (redirects to website)
- Extension logout button (deferred — can be added to profile section later)
- Production domain hardcoding (uses localhost:3000 for now, env var approach deferred)
