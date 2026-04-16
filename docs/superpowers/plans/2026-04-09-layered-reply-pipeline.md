# Layered Reply Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/generateReply` in `convex/http.ts` to a layered human decision pipeline — structured analysis in Call 1, persona-driven generation in Call 2, persona also applied to the no-brand single-call path.

**Architecture:** One file changes (`convex/http.ts`). The module-level `STYLE_RULES` constant is deleted and replaced by an inline persona string used in all generation calls. Call 1 (brand path) gains a richer system prompt that outputs four-field JSON `{match, postType, intent, wordTarget}`. Call 2 consumes those fields to shape the reply. The no-brand single-call path gets the persona and a platform-based word target.

**Tech Stack:** TypeScript, Convex HTTP actions, OpenRouter API (`google/gemini-2.5-flash-lite`)

---

## File Map

| File | Change |
|------|--------|
| `convex/http.ts` | Only file modified. Four scoped edits described in tasks below. |

No new files. No schema changes. No other routes touched.

---

## Task 1: Remove STYLE_RULES and upgrade the no-brand path

**Files:**
- Modify: `convex/http.ts` — lines ~166–182 (STYLE_RULES constant) and ~237–263 (no-brand single call)

No automated tests exist for Convex HTTP actions. Verification is done by deploying and observing Convex logs.

- [ ] **Step 1: Delete the STYLE_RULES constant**

Remove the entire block (lines ~166–182):

```typescript
// DELETE this entire constant — do not leave it commented out
const STYLE_RULES = `You write replies to social media posts...`;
```

- [ ] **Step 2: Replace the no-brand system prompt**

Find the no-brand path (starts with `// ── No brand context — single clean call ──`). Replace the `messages` array:

```typescript
// ── No brand context — single clean call ──
if (!brandCtx) {
  console.log(`[agentK] path     : clean (no brand)`);
  const wordRange = platform === "reddit" ? "24–32" : "20–26";
  const messages = [
    {
      role: "system" as const,
      content: `You are someone who learned English as a second language. Your vocabulary is simple and direct. Your grammar is slightly imperfect — occasional missing articles, short clipped sentences, light word-order variation. But your emotional intelligence is high. You read people well. You know when to push back, when to validate, when to ask the one question that makes someone think. Your replies feel like they came from a real person who actually read the post and had a genuine reaction.

Word target: ${wordRange} words. Hard cap 50.
Return only the reply. No quotes, no labels, no explanation.`,
    },
    {
      role: "user" as const,
      content: `${platformLabel}\nPost: "${tweetText.trim()}"\n\nGenerate a reply:`,
    },
  ];
```

- [ ] **Step 3: Update no-brand fetch — change max_tokens from 80 to 100**

In the same no-brand block, find the fetch body and change `max_tokens`:

```typescript
body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages, max_tokens: 100, temperature: 0.75 }),
```

- [ ] **Step 4: Deploy and smoke-test no-brand path**

```bash
npx convex deploy
```

Open the extension on any X or Reddit page **without** a brand synced. Click the AgentK button on a post. In Convex dashboard → Logs, confirm:
- `[agentK] path     : clean (no brand)` appears
- A reply is returned (not an error)
- Reply sounds conversational, slightly imperfect grammar

- [ ] **Step 5: Commit**

```bash
git add convex/http.ts
git commit -m "feat: replace STYLE_RULES with persona, upgrade no-brand path"
```

---

## Task 2: Upgrade Call 1 — structured analysis output

**Files:**
- Modify: `convex/http.ts` — Call 1 system prompt, user message, fetch params, and response parsing (~lines 265–330)

- [ ] **Step 1: Replace the Call 1 system prompt**

Find `// CALL 1 — Warm-up:` and replace `call1System` and `call1User`:

```typescript
// CALL 1 — Structured analysis: post type, intent, word target, ICP match
const call1System = `You are a post analyst and product-market fit classifier.

## Product context
Product: ${brandCtx.what}
Ideal customer: ${brandCtx.icp}
Problems this product solves:
${painList}

## Post types
- Problem: person describes a struggle or asks for help solving something
- Launch: announcing a new product, project, or feature
- Experience: sharing what happened to them (positive or negative)
- Guide: teaching or sharing a how-to
- Comparison: evaluating two or more options
- Opinion: hot take, rant, or strong assertion

## Reply intents
- Help: offer a solution or resource
- Validate: affirm the person's experience or point
- Question: ask the one thing that cuts to the core
- Contrarian: push back on the premise with a different angle
- Suggestion: suggest a specific next step or approach

## Intent defaults (you may override if the post warrants it)
| Post type  | Default intent      | Override when                 |
|------------|---------------------|-------------------------------|
| Problem    | Help / Suggestion   | Post is self-aware → Question |
| Launch     | Validate            | Overconfident → Contrarian    |
| Experience | Validate            | Negative experience → Help    |
| Guide      | Contrarian          | Genuinely useful → Validate   |
| Comparison | Contrarian          | Fair / nuanced → Question     |
| Opinion    | Contrarian          | Resonates → Validate          |

## Word target rules
- X (Twitter), any post type: 20–26
- Reddit, Problem post: 28–38
- Reddit, any other: 22–30

## ICP match rules
Set match: true ONLY if ALL three are true:
1. The author is actively experiencing the pain — not just discussing it
2. The pain maps directly to one of the listed pain points — not inferentially
3. The signal is unambiguous

Disqualifiers (match: false if any apply):
- Post is analytical, philosophical, or observational about a related topic
- Author is describing others' pain, not their own
- Connection requires more than one inferential step
- You are unsure — default is false

Return ONLY valid JSON, nothing else:
{"match": true, "postType": "Problem", "intent": "Help", "wordTarget": 28}`;

const call1User = `${platformLabel}\nPost: "${tweetText.trim()}"\n\nAnalyse this post and return the JSON object.`;
```

- [ ] **Step 2: Update Call 1 variables — replace `match` + `call1Response` with `analysis`**

Replace the variable declarations just below `call1Messages`:

```typescript
// Defaults used if Call 1 fails or returns unparseable output
const CALL1_DEFAULTS = { match: false, postType: "Opinion", intent: "Contrarian", wordTarget: 24 } as const;
type Analysis = { match: boolean; postType: string; intent: string; wordTarget: number };
let analysis: Analysis = { ...CALL1_DEFAULTS };
let call1Response = JSON.stringify(CALL1_DEFAULTS);
```

- [ ] **Step 3: Update Call 1 fetch — change max_tokens from 20 to 60**

```typescript
body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: call1Messages, max_tokens: 60, temperature: 0.1 }),
```

- [ ] **Step 4: Update Call 1 response parsing**

Replace the `if (res1.ok)` block to parse all four fields with validation and fallback:

```typescript
if (res1.ok) {
  const json1 = await res1.json();
  call1Response = (json1.choices?.[0]?.message?.content ?? "").trim() || JSON.stringify(CALL1_DEFAULTS);
  try {
    const cleaned = call1Response.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const validPostTypes = ["Problem", "Launch", "Experience", "Guide", "Comparison", "Opinion"];
    const validIntents   = ["Help", "Validate", "Question", "Contrarian", "Suggestion"];
    analysis = {
      match:      parsed.match === true,
      postType:   validPostTypes.includes(parsed.postType) ? parsed.postType : CALL1_DEFAULTS.postType,
      intent:     validIntents.includes(parsed.intent)     ? parsed.intent   : CALL1_DEFAULTS.intent,
      wordTarget: typeof parsed.wordTarget === "number" && parsed.wordTarget > 0 && parsed.wordTarget <= 50
                    ? Math.round(parsed.wordTarget)
                    : CALL1_DEFAULTS.wordTarget,
    };
  } catch {
    console.warn(`[agentK] Call 1 parse failed — using defaults`);
    analysis = { ...CALL1_DEFAULTS };
    call1Response = JSON.stringify(CALL1_DEFAULTS);
  }
} else {
  console.warn(`[agentK] Call 1 non-ok: ${res1.status} — using defaults`);
}
```

- [ ] **Step 5: Update the catch block to use analysis instead of match**

```typescript
} catch (err: any) {
  console.warn(`[agentK] Call 1 failed (${err.message}) — using defaults`);
  analysis = { ...CALL1_DEFAULTS };
  call1Response = JSON.stringify(CALL1_DEFAULTS);
}
```

- [ ] **Step 6: Update the Call 1 log line**

Replace:
```typescript
console.log(`[agentK] Call 1   : match → ${match}`);
```
With:
```typescript
console.log(`[agentK] Call 1   : match=${analysis.match} | ${analysis.postType} | ${analysis.intent} | ${analysis.wordTarget}w`);
```

- [ ] **Step 7: Deploy and verify Call 1 output**

```bash
npx convex deploy
```

With a brand synced, click AgentK on a post. In Convex logs, confirm the new log line appears, e.g.:
```
[agentK] Call 1   : match=false | Opinion | Contrarian | 24w
[agentK] Call 1   : match=true  | Problem | Help | 28w
```

- [ ] **Step 8: Commit**

```bash
git add convex/http.ts
git commit -m "feat: Call 1 structured analysis — postType, intent, wordTarget, match"
```

---

## Task 3: Upgrade Call 2 — persona-driven generation

**Files:**
- Modify: `convex/http.ts` — Call 2 user message and fetch params (~lines 332–385)

- [ ] **Step 1: Replace call2User with analysis-driven message**

Find `// CALL 2 —` and replace the entire `call2User` declaration:

```typescript
// CALL 2 — Persona-driven reply, guided by Call 1 analysis
const { match, postType, intent, wordTarget } = analysis;

const brandBlock = match
  ? `This person IS a genuine buyer. Weave the product name naturally at the end of your reply — 4–6 words, no pitch, no explanation.`
  : `This person is NOT a buyer. Zero product mention — not even implied.`;

const call2User = `Analysis result: ${JSON.stringify({ match, postType, intent, wordTarget })}

${brandBlock}

You are someone who learned English as a second language. Your vocabulary is simple and direct. Your grammar is slightly imperfect — occasional missing articles, short clipped sentences, light word-order variation. But your emotional intelligence is high. You read people well. You know when to push back, when to validate, when to ask the one question that makes someone think. Your replies feel like they came from a real person who actually read the post and had a genuine reaction.

Approach: ${postType} post → ${intent} intent.

HARD LIMITS:
- ${wordTarget} words (±4 acceptable, hard cap 50)
- Return only the reply. No quotes, no labels, no explanation.`;
```

- [ ] **Step 2: Update the Call 2 log line**

Replace:
```typescript
console.log(`[agentK] Call 2   : generating ${match ? "brand-aware" : "clean"} reply`);
```
With:
```typescript
console.log(`[agentK] Call 2   : generating reply (match=${analysis.match}, intent=${analysis.intent})`);
```

- [ ] **Step 3: Update Call 2 fetch — change max_tokens from 80 to 120**

```typescript
body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: call2Messages, max_tokens: 120, temperature: 0.75 }),
```

- [ ] **Step 4: Deploy and end-to-end test**

```bash
npx convex deploy
```

Test three post types — one problem post, one opinion post, one launch post — with brand synced. Verify in Convex logs:

- Call 1 log shows correct `postType` and `intent`
- Call 2 log reflects those values
- Reply text feels human: slight grammar imperfections, no STYLE_RULES mechanical tone
- Problem post with clear ICP match → reply ends with a natural product mention
- Opinion post → reply is contrarian, no product mention

- [ ] **Step 5: Commit**

```bash
git add convex/http.ts
git commit -m "feat: Call 2 persona-driven generation with analysis-guided reply"
```

---

## Self-Review Checklist

- [x] STYLE_RULES removed — Task 1 Step 1
- [x] No-brand path: persona + platform word target — Task 1 Steps 2–3
- [x] No-brand max_tokens 80 → 100 — Task 1 Step 3
- [x] Call 1: new system prompt (post types, intent matrix, word target rules, ICP match) — Task 2 Step 1
- [x] Call 1: new user message — Task 2 Step 1
- [x] Call 1: max_tokens 20 → 60 — Task 2 Step 3
- [x] Call 1: parses 4 fields with validation + fallback defaults — Task 2 Step 4
- [x] Call 1 defaults: `{ match: false, postType: "Opinion", intent: "Contrarian", wordTarget: 24 }` — Task 2 Step 2
- [x] Call 2: uses `postType`, `intent`, `wordTarget` from analysis — Task 3 Step 1
- [x] Call 2: persona in user message — Task 3 Step 1
- [x] Call 2: max_tokens 80 → 120 — Task 3 Step 3
- [x] Logging: all four analysis fields logged — Task 2 Step 6 + Task 3 Step 2
- [x] `match` variable replaced by `analysis.match` everywhere — Tasks 2–3
