# Billing & Auth Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone /billing page, move all billing UI into the extension profile section with live data, fix the auth logout sync bug between website and extension, and align plan badge colors across both surfaces.

**Architecture:** The website and extension use two separate auth systems (Convex JWT cookies vs. custom `extensionSessions` tokens). We bridge logout by extending the existing `AuthBridge` postMessage pattern. Billing data for the extension is served via a new `/extensionBilling` HTTP action that authenticates via extension token. The `/billing` Next.js page is deleted; all billing history lives in the extension profile tab.

**Tech Stack:** Next.js 14 (App Router), Convex (HTTP actions + queries), Chrome Extension MV3 (vanilla JS content script), `@convex-dev/auth`, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/AuthBridge.tsx` | Modify | Add logout postMessage when isAuthenticated → false |
| `components/Navbar.tsx` | Modify | Remove Billing link |
| `components/PlanBadge.tsx` | Modify | Fix badge colors to match design system |
| `app/billing/page.tsx` | Delete | Removed — billing lives in extension only |
| `convex/extensionAuth.ts` | Modify | Fix hardcoded `plan: "free"` in getSessionByToken |
| `convex/billing.ts` | Modify | Add getBillingDataForUser internalQuery |
| `convex/http.ts` | Modify | Add GET/OPTIONS /extensionBilling route |
| `chrome-extension/content.js` | Modify | Add AGENTK_LOGOUT handler + billing card with real data |

---

## Task 1: Fix logout sync — AuthBridge

**Files:**
- Modify: `components/AuthBridge.tsx`

- [ ] **Step 1: Replace AuthBridge with logout-aware version**

Replace the entire file content:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Silent component mounted inside Providers.
 * On login: creates an extension session token and broadcasts AGENTK_AUTH.
 * On logout: broadcasts AGENTK_LOGOUT so the extension clears its session.
 */
export function AuthBridge() {
  const { isAuthenticated } = useConvexAuth();
  const createSession = useMutation(api.extensionAuth.createExtensionSession);
  const prevAuth = useRef<boolean | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
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
    } else if (prevAuth.current === true) {
      // Transitioned from logged-in to logged-out — notify extension immediately.
      window.postMessage({ type: "AGENTK_LOGOUT" }, window.location.origin);
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AuthBridge.tsx
git commit -m "fix: broadcast AGENTK_LOGOUT to extension on website sign-out"
```

---

## Task 2: Fix logout sync — content script

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Extend message listener to handle AGENTK_LOGOUT**

Find the existing `window.addEventListener("message", ...)` block near the bottom of `content.js` (around line 1956). It currently looks like:

```js
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

Replace it with:

```js
window.addEventListener("message", (event) => {
  // Only accept messages from the AgentK website.
  if (event.origin !== "http://localhost:3000") return;
  if (!event.data?.type) return;

  if (event.data.type === "AGENTK_AUTH") {
    const { token, email, username, authMethod } = event.data;
    if (!token || !email) return;
    chrome.storage.local.set({
      agentKAuth: { token, email, username: username ?? "", authMethod: authMethod ?? "password" },
    });
    console.log("[agentK] Auth session stored from website.");
    return;
  }

  if (event.data.type === "AGENTK_LOGOUT") {
    chrome.storage.local.remove("agentKAuth");
    console.log("[agentK] Auth session cleared by website logout.");
    // If popup is currently open, drop back to auth gate immediately.
    if (host?.isConnected) {
      unmount();
      mount();
    }
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "fix: handle AGENTK_LOGOUT in content script to sync logout state"
```

---

## Task 3: Fix hardcoded plan in getSessionByToken

**Files:**
- Modify: `convex/extensionAuth.ts`

- [ ] **Step 1: Fix getSessionByToken to return real plan**

Find the `getSessionByToken` internalQuery handler (around line 105). The return block currently hardcodes `plan: "free"`. Replace the entire handler body:

```ts
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

    const billing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", session.userId))
      .unique();

    return {
      email:      user.email ?? "",
      username:   user.name ?? "",
      authMethod,
      plan:       billing?.plan ?? "free",
      userId:     session.userId,
    };
  },
});
```

Note: `userId` is now included in the return value — needed by the `/extensionBilling` endpoint in Task 5.

- [ ] **Step 2: Commit**

```bash
git add convex/extensionAuth.ts
git commit -m "fix: return real plan from getSessionByToken instead of hardcoded free"
```

---

## Task 4: Remove /billing page and clean up Navbar + PlanBadge

**Files:**
- Delete: `app/billing/page.tsx`
- Modify: `components/Navbar.tsx`
- Modify: `components/PlanBadge.tsx`

- [ ] **Step 1: Delete the billing page**

```bash
rm app/billing/page.tsx
```

- [ ] **Step 2: Remove Billing link from Navbar**

In `components/Navbar.tsx`, find and remove these lines from the authenticated block:

```tsx
<a
  href="/billing"
  className="text-sm font-medium hover:opacity-80 transition-opacity"
  style={{ color: "#62584F" }}
>
  Billing
</a>
```

The authenticated block should become:

```tsx
{isAuthenticated ? (
  <div className="flex items-center gap-3">
    <PlanBadge />
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-default select-none"
      style={{ backgroundColor: "#DF849D" }}
      title={email}
    >
      {initial || "?"}
    </div>
  </div>
) : (
  <button
    onClick={() => setAuthOpen(true)}
    className="bg-on-surface text-surface px-6 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-all active:scale-95 duration-200 ease-in-out"
  >
    Login
  </button>
)}
```

- [ ] **Step 3: Fix PlanBadge colors to match extension design system**

Replace the entire `components/PlanBadge.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConvexAuth } from "convex/react";

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  free:  { bg: "#F0F0EE", text: "#62584F", label: "Free"  },
  pro:   { bg: "#FDE8EE", text: "#DF849D", label: "Pro"   },
  ultra: { bg: "#191918", text: "#ffffff", label: "Ultra" },
};

export default function PlanBadge() {
  const { isAuthenticated } = useConvexAuth();
  const billing = useQuery(api.billing.getUserPlan, isAuthenticated ? {} : "skip");

  if (!isAuthenticated || !billing) return null;

  const style = BADGE_STYLES[billing.plan] ?? BADGE_STYLES.free;

  return (
    <span
      className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/Navbar.tsx components/PlanBadge.tsx
git commit -m "feat: remove billing page, clean up navbar, fix plan badge colors"
```

---

## Task 5: Add /extensionBilling Convex endpoint

**Files:**
- Modify: `convex/billing.ts`
- Modify: `convex/http.ts`

- [ ] **Step 1: Add getBillingDataForUser internalQuery to billing.ts**

Add this at the end of `convex/billing.ts`, before the final closing (after `upsertUserBilling`):

```ts
/**
 * Returns full billing data for a user: plan, active subscription, last 20 payments.
 * Used by the /extensionBilling HTTP endpoint.
 */
export const getBillingDataForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const billing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user_paid_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);

    return {
      plan:         billing?.plan ?? "free",
      subscription: subscription ?? null,
      payments,
    };
  },
});
```

- [ ] **Step 2: Add GET /extensionBilling and OPTIONS routes to http.ts**

Add the following two routes at the end of `convex/http.ts`, just before the final `export default http;` line:

```ts
/* ── Extension Billing ── */
http.route({
  path: "/extensionBilling",
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

    const data = await ctx.runQuery(internal.billing.getBillingDataForUser, {
      userId: session.userId,
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/extensionBilling",
  method: "OPTIONS",
  handler: httpAction(async () =>
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    })
  ),
});
```

- [ ] **Step 3: Commit**

```bash
git add convex/billing.ts convex/http.ts
git commit -m "feat: add /extensionBilling HTTP endpoint for extension billing data"
```

---

## Task 6: Enhance extension billing card with real data

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Add currentBilling module-level variable**

Near the top of the file, alongside the other module-level state variables (around line 7, after `let currentUser`), add:

```js
let currentBilling = null; // { plan, subscription, payments } — fetched after auth
```

- [ ] **Step 2: Add billing CSS for the invoice table**

In the CSS string (the `const CSS = \`...\`` block), find the line:

```css
.profile-invoice-empty { font-size: 11px; color: #C8B89A; margin-top: 6px; }
```

Add after it:

```css
.billing-meta { font-size: 11px; color: #B2A28C; margin-top: 3px; margin-bottom: 10px; }
.billing-cta {
  display: inline-block; margin-top: 10px; padding: 6px 14px;
  border-radius: 8px; font-size: 11px; font-weight: 700; text-decoration: none;
  transition: opacity 0.15s;
}
.billing-cta:hover { opacity: 0.85; }
.billing-cta-upgrade {
  background: linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%); color: #fff;
}
.billing-cta-manage {
  border: 1.5px solid rgba(0,0,0,0.12); background: #fff; color: #62584F;
}
.billing-invoices { margin-top: 14px; }
.billing-invoices-label { font-size: 10px; font-weight: 700; color: #B2A28C; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
.billing-invoice-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 11px;
}
.billing-invoice-row:last-child { border-bottom: none; }
.billing-invoice-date { color: #62584F; min-width: 80px; }
.billing-invoice-plan { color: #3D3A36; font-weight: 600; flex: 1; padding: 0 8px; }
.billing-invoice-amount { color: #191918; font-weight: 700; min-width: 48px; text-align: right; }
.billing-invoice-status {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  padding: 2px 6px; border-radius: 20px; margin-left: 6px;
}
.billing-status-succeeded { background: #DCFCE7; color: #15803D; }
.billing-status-failed    { background: #FEE2E2; color: #DC2626; }
.billing-invoice-pdf { font-size: 10px; font-weight: 700; color: #DF849D; text-decoration: none; margin-left: 6px; }
.billing-invoice-pdf:hover { text-decoration: underline; }
```

- [ ] **Step 3: Add fetchBilling helper function**

Add this function after the `syncStorage` function (around line 91):

```js
async function fetchBilling(token) {
  try {
    const res = await fetch(
      `${CONVEX_SITE_URL}/extensionBilling?token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}
```

- [ ] **Step 4: Fetch billing data during mount**

In `mount()`, after `currentUser = { ...stored.agentKAuth, ...userData };` and before `renderInternal(root, shadow);`, add:

```js
// Fetch billing data for profile section.
currentBilling = await fetchBilling(currentUser.token);
```

- [ ] **Step 5: Replace the static billing card in profileHTML()**

Find the billing card block in `profileHTML()`:

```js
          <!-- Billing card (full width) -->
          <div class="profile-card profile-card-full">
            <span class="profile-block-label">Billing</span>
            <span class="plan-badge ${planClass}">${planLabel}</span>
            <p class="profile-plan-tagline">${planLabel} plan</p>
            <a href="http://localhost:3000/#pricing" target="_blank" class="profile-link-btn">Manage billing →</a>
            <p class="profile-invoice-empty">No invoices yet.</p>
          </div>
```

Replace it with:

```js
          <!-- Billing card (full width) -->
          <div class="profile-card profile-card-full">
            <span class="profile-block-label">Billing</span>
            ${billingCardHTML()}
          </div>
```

Then add the `billingCardHTML` helper function anywhere before `profileHTML()`:

```js
  function billingCardHTML() {
    const b = currentBilling;
    const plan = b?.plan ?? currentUser?.plan ?? 'free';
    const planClass = plan === 'ultra' ? 'plan-ultra' : plan === 'pro' ? 'plan-pro' : 'plan-free';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    const sub = b?.subscription ?? null;

    // Meta line: "Pro · Monthly" or "Free"
    let metaLine = planLabel;
    if (sub?.interval) {
      metaLine += ' · ' + sub.interval.charAt(0).toUpperCase() + sub.interval.slice(1);
    }

    // Renewal/cancellation line
    let renewLine = '';
    if (sub?.currentPeriodEnd) {
      const date = new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      renewLine = sub.cancelAtPeriodEnd ? `Cancels ${date}` : `Renews ${date}`;
    }

    // CTA
    const ctaHTML = plan === 'free'
      ? `<a href="http://localhost:3000/#pricing" target="_blank" class="billing-cta billing-cta-upgrade">Upgrade →</a>`
      : `<a href="http://localhost:3000/#pricing" target="_blank" class="billing-cta billing-cta-manage">Change Plan →</a>`;

    // Invoices
    const payments = b?.payments ?? [];
    let invoicesHTML = '';
    if (payments.length === 0) {
      invoicesHTML = `<p class="profile-invoice-empty">No payments yet.</p>`;
    } else {
      const rows = payments.map(p => {
        const date = new Date(p.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const planStr = p.plan
          ? (p.plan.charAt(0).toUpperCase() + p.plan.slice(1)) + (p.interval ? ' · ' + p.interval.charAt(0).toUpperCase() + p.interval.slice(1) : '')
          : '—';
        const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency ?? 'USD' }).format((p.amount ?? 0) / 100);
        const statusClass = p.status === 'succeeded' ? 'billing-status-succeeded' : 'billing-status-failed';
        const pdfLink = p.invoiceUrl
          ? `<a href="http://localhost:3000/api/billing/invoice/${p.dodoPaymentId}" target="_blank" class="billing-invoice-pdf">PDF</a>`
          : '';
        return `<div class="billing-invoice-row">
          <span class="billing-invoice-date">${date}</span>
          <span class="billing-invoice-plan">${planStr}</span>
          <span class="billing-invoice-amount">${amount}</span>
          <span class="billing-invoice-status ${statusClass}">${p.status}</span>
          ${pdfLink}
        </div>`;
      }).join('');
      invoicesHTML = `<div class="billing-invoices">
        <div class="billing-invoices-label">Payment History</div>
        ${rows}
      </div>`;
    }

    return `
      <span class="plan-badge ${planClass}">${planLabel}</span>
      <p class="billing-meta">${metaLine}${renewLine ? ' &nbsp;·&nbsp; ' + renewLine : ''}</p>
      ${ctaHTML}
      ${invoicesHTML}
    `;
  }
```

- [ ] **Step 6: Refresh billing data in the 30s plan poll**

Find the `planPollInterval = setInterval(async () => {` block added in a previous session. After the line that updates `currentUser.plan`, add a billing refresh and DOM patch:

```js
// Also refresh billing data
currentBilling = await fetchBilling(currentUser.token);
// Re-render billing card if profile tab is visible
const billingCard = shadow.querySelector('.profile-card-full');
if (billingCard) {
  billingCard.innerHTML = `<span class="profile-block-label">Billing</span>${billingCardHTML()}`;
}
```

The full updated interval should look like:

```js
planPollInterval = setInterval(async () => {
  if (!currentUser?.token) return;
  try {
    const res = await fetch(
      `${CONVEX_SITE_URL}/extensionUser?token=${encodeURIComponent(currentUser.token)}`
    );
    if (!res.ok) return;
    const fresh = await res.json();
    const newPlan = fresh.plan ?? 'free';
    const planChanged = newPlan !== (currentUser.plan ?? 'free');
    if (planChanged) {
      currentUser = { ...currentUser, plan: newPlan };
      chrome.storage.local.set({ agentKAuth: { ...currentUser } });
    }
    // Always refresh billing data and patch the card
    currentBilling = await fetchBilling(currentUser.token);
    const shadow = host?.shadowRoot;
    if (shadow) {
      const billingCard = shadow.querySelector('.profile-card-full');
      if (billingCard) {
        billingCard.innerHTML = `<span class="profile-block-label">Billing</span>${billingCardHTML()}`;
      }
      if (planChanged) {
        const badge = shadow.querySelector('.plan-badge');
        if (badge) {
          const planClass = newPlan === 'ultra' ? 'plan-ultra' : newPlan === 'pro' ? 'plan-pro' : 'plan-free';
          const planLabel = newPlan.charAt(0).toUpperCase() + newPlan.slice(1);
          badge.className = `plan-badge ${planClass}`;
          badge.textContent = planLabel;
          const tagline = shadow.querySelector('.profile-plan-tagline');
          if (tagline) tagline.textContent = `${planLabel} plan`;
        }
      }
    }
  } catch (_) { /* network hiccup — ignore */ }
}, 30_000);
```

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: extension billing card shows real plan, subscription, and payment history"
```

---

## Self-Review Checklist

- [x] **Spec coverage**
  - Auth sync logout: Task 1 (AuthBridge) + Task 2 (content script)
  - Hardcoded plan bug: Task 3 (getSessionByToken)
  - Remove /billing page: Task 4
  - Navbar cleanup: Task 4
  - PlanBadge colors: Task 4
  - /extensionBilling endpoint: Task 5
  - Extension billing card with real data: Task 6
  - Real-time polling refresh: Task 6 Step 6

- [x] **No placeholders** — all code blocks are complete and concrete

- [x] **Type consistency**
  - `getSessionByToken` now returns `userId` (Task 3), which `/extensionBilling` uses (Task 5)
  - `getBillingDataForUser` returns `{ plan, subscription, payments }` (Task 5), which `billingCardHTML()` destructures as `b.plan`, `b.subscription`, `b.payments` (Task 6)
  - `currentBilling` variable added in Task 6 Step 1, populated in Task 6 Step 4, used in `billingCardHTML()` Task 6 Step 5
