# ICP Pipeline Redesign — Spec
**Date:** 2026-04-07

## Problem

The current `/generateReply` handler asks a single LLM call to simultaneously classify (does this post match the ICP?), judge (how confident?), and generate (write the reply). These tasks have conflicting needs:

- Classification needs precision → low temperature, structured output
- Generation needs creativity → higher temperature, free-form

Additional failure modes:
- The brand block is appended *after* "Return only the reply" — structurally an afterthought the model overrides
- "clearly fits this profile" has no rubric — the model has no framework for what "clearly" means
- 20–28 word limit is too tight when a brand mention (up to 5 words) is also required
- No post context (platform, subreddit) is passed — a `r/SaaS` post and a `r/mildlyinteresting` post look identical to the model
- `replyHint` extracted during sync is vague advice, not a concrete phrase

## Architecture

```
POST /generateReply (brandUrl present)
  └── Fetch brand context from DB
  └── Call 1 — Classifier
        model: gemini-2.5-flash-lite
        temp: 0.1, max_tokens: 60, thinking: disabled
        output: { score: 1|2|3, matchedPain: "string | null" }
  └── score === 3 → Call 2 — Brand-aware generator
        word limit: 20–32
        brand context injected FIRST in system prompt
        matchedPain from Call 1 passed explicitly
  └── score < 3  → Call 2 — Clean generator
        current prompt unchanged, no brand context

POST /generateReply (no brandUrl)
  └── Single call — Clean generator (no change to current behavior)
```

## Score Rubric

| Score | Meaning | Action |
|-------|---------|--------|
| 3 | Author explicitly shows the pain, or is unmistakably in the ICP situation (role + problem + stage all visible in the post) | Embed brand |
| 2 | Topic overlaps but author's situation is unclear | No embed |
| 1 | Different audience, different problem, or unrelated | No embed |

Threshold: **score 3 only**. Never embed on a 2.

## Classifier Prompt

```
system:
You are an ICP matcher. Score how well this post's author fits a customer profile.

ICP: {icp}

Pain points — any ONE of these counts:
1. {pain1}
2. {pain2}
3. {pain3}

Score:
3 = Clear match — author explicitly has this pain or is unmistakably in this situation
2 = Possible — topic overlaps but unclear
1 = No match

Return ONLY valid JSON, nothing else:
{"score": 1, "matchedPain": null}
{"score": 3, "matchedPain": "exact pain from the list above"}

user:
Platform: {platform} | {subreddit if Reddit}
Post: "{postText}"
```

Pain points are numbered (not comma-separated). The model returns the exact string from the list — no rephrasing. JSON examples anchor the output format and prevent markdown or explanation leaking in.

## Brand-Aware Generator Prompt (score === 3)

Brand context placed **first** — before style rules, before tone rules, before the word limit instruction:

```
system:
CONTEXT:
The person who wrote this post is experiencing: {matchedPain}
You happen to know a product that addresses this directly: {productDescription}
Weave a mention of it into your reply — naturally, at the end, like someone who found it useful.
Keep the mention to 4–6 words. Do not explain it. Do not pitch it.
How to phrase it: {replyHint}

REPLY RULES:
[style rules — unchanged]
[tone rules — unchanged]
[banned words — unchanged]

HARD LIMITS:
- 20–32 words (extended 4 words to accommodate natural brand mention)
- Return only the reply. No quotes, no labels, no explanation.

user:
Platform: {platform} | {subreddit if Reddit}
Post: "{postText}"
```

The `matchedPain` from Call 1 makes the generator's context specific — it reacts to a known pain rather than guessing which one applies.

## Extraction Prompt Change (syncBrand)

`replyHint` currently produces vague advice. Change the extraction instruction to require a concrete example phrase:

**Before:**
```
"replyHint": "One sentence: how to mention this product naturally in conversation without sounding promotional"
```

**After:**
```
"replyHint": "A specific 6–10 word example phrase showing how to drop the product name naturally in a social media reply, from the perspective of someone who uses it. Include the product name. Example: 'tried [ProductName] for this — actually helped'"
```

No schema change needed. Re-syncing the domain regenerates `replyHint` with the new format.

## Post Context Enrichment

The extension passes two new optional fields alongside `tweetText`:

```json
{
  "tweetText": "...",
  "platform": "reddit",
  "subreddit": "r/SaaS",
  "deviceId": "...",
  "brandUrl": "..."
}
```

These are prepended to the user message in both classifier and generator calls:

```
Platform: Reddit | r/SaaS
Post: "..."
```

Platform context gives the classifier meaningful signal. The same post in `r/SaaS` vs `r/mildlyinteresting` should produce different scores.

## Files to Modify

| File | Change |
|------|--------|
| `convex/http.ts` | `/generateReply` — add classifier call, conditional brand-aware generator, accept `platform` + `subreddit` |
| `convex/http.ts` | `/syncBrand` — update `replyHint` extraction instruction |
| `chrome-extension/content.js` | Both X and Reddit `generateReply` calls — pass `platform` + `subreddit` |

## Error Handling

- Classifier parse failure (invalid JSON) → fall through to clean generator, no brand embed
- Classifier timeout → same fallback
- Generator Call 2 failure → existing error handling unchanged
- If `matchedPain` is null despite score 3 (model error) → treat as score 2, no embed

## Latency Impact

- No brandUrl: no change
- brandUrl set, score < 3: +1 classifier call (~300–500ms)
- brandUrl set, score === 3: +1 classifier call (~300–500ms) + generator runs with richer context
- Both calls use same model (gemini-2.5-flash-lite), classifier is max 60 tokens output so it is fast
