# ICP Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-call ICP-match-and-generate flow with a two-call pipeline: a precise classifier (score 1–3) followed by a conditional brand-aware or clean generator.

**Architecture:** Call 1 is a low-temperature classifier that returns `{ score, matchedPain }` as JSON. Only a score of 3 triggers Call 2 with brand context injected first in the system prompt. Score < 3 falls through to a clean generator with no brand mention. Classifier failures always fall through to the clean generator.

**Tech Stack:** TypeScript, Convex HTTP actions, OpenRouter (google/gemini-2.5-flash-lite), Chrome Extension MV3 content script.

---

### Task 1: Update `replyHint` extraction in `/syncBrand`

**Files:**
- Modify: `convex/http.ts` (line ~659 — the `replyHint` field in `extractionPrompt`)

- [ ] **Step 1: Replace the replyHint instruction in the extraction prompt**

In `convex/http.ts`, find this line inside `extractionPrompt`:

```
  "replyHint": "One sentence: how to mention this product naturally in conversation without sounding promotional"
```

Replace it with:

```
  "replyHint": "A specific 6-10 word example phrase showing how to drop the product name naturally in a social media reply, from the perspective of someone who uses it. Include the product name. Example format: 'tried [ProductName] for this, actually helped'"
```

The full updated `extractionPrompt` JSON schema block becomes:

```typescript
const extractionPrompt = `You are analyzing website content for a product using the Feynman Technique.
Return ONLY valid JSON, no markdown, no explanation:

{
  "what": "One clear sentence: what does this product do",
  "who": "Who are the primary users (specific, not generic)",
  "icp": "The ideal customer: specific role, situation, and goals",
  "painPoints": ["specific pain 1", "specific pain 2", "specific pain 3"],
  "features": "Key features in 2-3 sentences",
  "pricing": "Pricing summary, or Not found",
  "replyHint": "A specific 6-10 word example phrase showing how to drop the product name naturally in a social media reply, from the perspective of someone who uses it. Include the product name. Example format: 'tried [ProductName] for this, actually helped'"
}

HOMEPAGE:
${homepage}

ABOUT:
${about}

PRICING:
${pricing}`;
```

- [ ] **Step 2: Commit**

```bash
git add convex/http.ts
git commit -m "feat: improve replyHint extraction to produce concrete example phrase"
```

---

### Task 2: Rewrite `/generateReply` with two-call pipeline

**Files:**
- Modify: `convex/http.ts` — the `/generateReply` POST handler (lines ~167–290)

- [ ] **Step 1: Add `classifyICP` helper function above the `/generateReply` route**

Insert this function directly above the `/* ── Reply Generation ── */` comment:

```typescript
/* ── ICP Classifier ── */
async function classifyICP(
  apiKey: string,
  postText: string,
  postContext: string,
  icp: string,
  painPoints: string,
): Promise<{ score: number; matchedPain: string | null }> {
  let pains: string[] = [];
  try { pains = JSON.parse(painPoints); } catch { pains = [painPoints]; }
  const painList = pains.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const system = `You are an ICP matcher. Score how well this post's author fits a customer profile.

ICP: ${icp}

Pain points — any ONE of these counts:
${painList}

Score:
3 = Clear match — author explicitly has this pain or is unmistakably in this situation
2 = Possible — topic overlaps but unclear
1 = No match

Return ONLY valid JSON, nothing else:
{"score": 1, "matchedPain": null}
{"score": 3, "matchedPain": "exact pain from the list above"}`;

  const user = `${postContext}\nPost: "${postText.trim()}"`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agentk.io",
        "X-Title": "AgentK",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user },
        ],
        max_tokens: 60,
        temperature: 0.1,
        thinking: { type: "disabled" },
      }),
    });
    clearTimeout(t);
    if (!res.ok) return { score: 1, matchedPain: null };
    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const score = [1, 2, 3].includes(parsed.score) ? parsed.score : 1;
    const matchedPain = score === 3 && typeof parsed.matchedPain === "string" ? parsed.matchedPain : null;
    return { score, matchedPain };
  } catch {
    clearTimeout(t);
    return { score: 1, matchedPain: null };
  }
}
```

- [ ] **Step 2: Replace the `/generateReply` handler body**

Replace the entire handler (from `handler: httpAction(async (ctx, request) => {` through the closing `}),`) with:

```typescript
  handler: httpAction(async (ctx, request) => {
    const { tweetText, deviceId, brandUrl, platform, subreddit } = await request.json();

    if (!tweetText || typeof tweetText !== "string") {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Build post context prefix for both classifier and generator
    const platformLabel = platform === "reddit"
      ? `Platform: Reddit${subreddit ? ` | ${subreddit}` : ""}`
      : "Platform: X (Twitter)";

    // Classifier — only runs when brand context is available
    let matchedPain: string | null = null;
    let brandCtx: { what: string; icp: string; painPoints: string; replyHint: string } | null = null;

    if (deviceId && brandUrl && typeof brandUrl === "string") {
      const normalizedBrandUrl = normalizeBrandUrl(brandUrl);
      const ctx_result = await ctx.runQuery(internal.brand.getBrandContext, {
        deviceId,
        url: normalizedBrandUrl,
      });
      if (ctx_result) {
        brandCtx = ctx_result;
        const classification = await classifyICP(
          apiKey,
          tweetText,
          platformLabel,
          brandCtx.icp,
          brandCtx.painPoints,
        );
        console.log("[agentK] ICP classification:", classification);
        if (classification.score === 3 && classification.matchedPain) {
          matchedPain = classification.matchedPain;
        }
      }
    }

    // Build system prompt — brand-aware if matched, clean otherwise
    const STYLE_RULES = `You write replies to social media posts. Your goal is to spark genuine engagement — not to agree, not to fight, but to make people think or respond.

Style rules:
- Use minimal punctuation. No periods at the end. Commas only when truly needed. No exclamation marks.
- Never write in perfect structured sentences. Let it feel slightly off, like a real person typing fast.
- No polished phrasing, no transitions like "however" or "that said", no em dashes.
- Lowercase is fine. Contractions are good. Subtle typos are okay.

Tone rules:
- Be friendly but mildly contrarian — push back on the premise, offer a different angle, or ask a question that challenges the assumption.
- Do not validate or simply agree. Do not lecture. Do not moralize.
- Never sound like an ad, a bot, or someone trying too hard.
- The reply should feel like it came from someone who actually read the post and had a quick genuine reaction.

Banned words and phrases — never use these under any circumstances:
lol, lmao, lmfao, omg, fr, frfr, ngl, tbh, tho, bruh, bro, fam, no cap, facts, slay, lowkey, highkey, bussin, goated, mid, based, cope, valid, periodt, deadass, bet, sheesh, sus, vibe, vibes, hits different, real talk, on god, sending me, i'm dead, istg, imo, idk, smh, rn, irl, af, asf, literally (used as filler), like (used as filler).`;

    let systemPrompt: string;
    let wordLimit: string;

    if (matchedPain && brandCtx) {
      wordLimit = "20–32 words";
      systemPrompt = `CONTEXT:
The person who wrote this post is experiencing: ${matchedPain}
You happen to know a product that addresses this directly: ${brandCtx.what}
Weave a mention of it into your reply — naturally, at the end, like someone who found it useful.
Keep the mention to 4–6 words. Do not explain it. Do not pitch it.
How to phrase it: ${brandCtx.replyHint}

REPLY RULES:
${STYLE_RULES}

HARD LIMITS:
- ${wordLimit}
- Return only the reply. No quotes, no labels, no explanation.`;
    } else {
      wordLimit = "20–28 words";
      systemPrompt = `${STYLE_RULES}

Hard limits:
- ${wordLimit}. Not more.
- Return only the reply. No quotes, no labels, no explanation.`;
    }

    const userMessage = `${platformLabel}\nPost: "${tweetText.trim()}"\n\nGenerate a reply:`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://agentk.io",
            "X-Title": "AgentK",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: userMessage  },
            ],
            max_tokens: 80,
            temperature: 0.75,
            thinking: { type: "disabled" },
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("[agentK] OpenRouter error:", errText);
        throw new Error(`OpenRouter responded ${res.status}: ${errText.slice(0, 120)}`);
      }

      const json = await res.json();
      const reply = (json.choices?.[0]?.message?.content ?? "").trim();
      if (!reply) throw new Error("Empty response from model");

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err: any) {
      console.error("[agentK] generateReply error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors. If `ctx_result` naming conflicts, rename to `rawBrandCtx` everywhere inside the handler.

- [ ] **Step 4: Commit**

```bash
git add convex/http.ts
git commit -m "feat: two-call ICP classifier + conditional brand-aware generator"
```

---

### Task 3: Pass `platform` and `subreddit` from extension

**Files:**
- Modify: `chrome-extension/content.js` — X `generateReply` function (~line 2194) and Reddit `generateReply` function (~line 2436)

- [ ] **Step 1: Update X `generateReply` to pass `platform: 'x'`**

Find the X `generateReply` function. Its body JSON currently is:

```js
body: JSON.stringify({
  tweetText,
  deviceId: stored.deviceId,
  brandUrl: state.brandUrl || undefined,
}),
```

Replace with:

```js
body: JSON.stringify({
  tweetText,
  platform: 'x',
  deviceId: stored.deviceId,
  brandUrl: state.brandUrl || undefined,
}),
```

- [ ] **Step 2: Update Reddit `generateReply` to pass `platform: 'reddit'` and `subreddit`**

Find the Reddit `generateReply` function. Its body JSON currently is:

```js
body: JSON.stringify({
  tweetText: commentText,
  deviceId: stored.deviceId,
  brandUrl: state.brandUrl || undefined,
}),
```

Replace with:

```js
const subredditMatch = window.location.pathname.match(/^\/r\/([^/]+)/i);
const subreddit = subredditMatch ? `r/${subredditMatch[1]}` : undefined;
```

(add this line immediately before the `fetch(...)` call)

Then update the body:

```js
body: JSON.stringify({
  tweetText: commentText,
  platform: 'reddit',
  subreddit,
  deviceId: stored.deviceId,
  brandUrl: state.brandUrl || undefined,
}),
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: pass platform and subreddit context to generateReply"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Deploy Convex changes**

```bash
npx convex deploy
```

Expected: deployment succeeds, no function errors.

- [ ] **Step 2: Re-sync brand domain**

In the extension Settings tab, reset the brand URL (click the pencil icon), re-enter the domain, and click Sync. This regenerates `replyHint` with the improved extraction prompt. Verify the console logs `[agentK] syncBrand success:` with a `replyHint` that contains an actual product name and phrase, not generic advice.

- [ ] **Step 3: Test ICP miss — verify no embed**

Find a post clearly unrelated to the product's ICP (e.g., a gaming post if the product targets SaaS founders). Click the agentK icon. Verify the Convex logs show `ICP classification: { score: 1, matchedPain: null }` and the reply contains no product mention.

- [ ] **Step 4: Test ICP match — verify natural embed**

Find a post where the author clearly describes a pain point from the ICP (e.g., for mediafa.st: someone complaining about spending hours figuring out which subreddits to post in). Click the agentK icon. Verify the Convex logs show `ICP classification: { score: 3, matchedPain: "..." }` and the reply naturally includes the product name at the end.

- [ ] **Step 5: Test classifier fallback on bad JSON**

Temporarily set `max_tokens: 5` in the classifier call to force a truncated/invalid JSON response. Verify the reply still generates cleanly (no brand embed, no error surfaced to the user). Revert `max_tokens` to 60.
