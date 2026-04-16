# Layered Reply Pipeline — Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Overview

Upgrade the `/generateReply` handler in `convex/http.ts` from a simple two-call ICP-match flow into a layered human decision system. The upgraded pipeline classifies the post, selects a reply intent, sets a dynamic word target, and generates a reply through a non-native English speaker persona with high emotional intelligence.

---

## Architecture

Two paths remain. Both are upgraded.

```
POST /generateReply
│
├── no brand context
│   └── Call 1 (generation only)
│       Persona + platform-based word target baked in
│       max_tokens: 100, temp: 0.75
│
└── brand context present
    ├── Call 1 (analysis layer)
    │   ICP match + post type + intent + word target
    │   max_tokens: 60, temp: 0.1
    │
    └── Call 2 (generation layer, extends Call 1)
        Persona-driven, analysis-guided reply
        max_tokens: 120, temp: 0.75
```

The module-level `STYLE_RULES` constant is **retired**. The persona replaces it in all paths.

---

## Call 1 — Analysis Layer (brand path only)

### Purpose

Perform structured post analysis. Load brand context into model memory, classify the post, select the ideal reply intent, and decide word target. Output is a flat JSON object consumed by Call 2.

### Output Schema

```json
{
  "match": true,
  "postType": "Problem",
  "intent": "Help",
  "wordTarget": 28
}
```

- `match` — `true` only if the post author is **actively expressing** a firsthand problem this product directly solves. Observing, analyzing, or discussing a related topic does not qualify. Default: `false`.
- `postType` — one of: `Problem`, `Launch`, `Experience`, `Guide`, `Comparison`, `Opinion`
- `intent` — one of: `Help`, `Validate`, `Question`, `Contrarian`, `Suggestion`
- `wordTarget` — integer, derived from the rules below

### Post Type Taxonomy

| Type | Definition |
|------|-----------|
| `Problem` | Person describes a struggle or asks for help solving something |
| `Launch` | Announcing a new product, project, or feature |
| `Experience` | Sharing what happened to them (positive or negative) |
| `Guide` | Teaching or sharing a how-to |
| `Comparison` | Evaluating two or more options |
| `Opinion` | Hot take, rant, or strong assertion |

### Intent Matrix (soft guide — model may override with reason)

| Post type | Default intent | Override trigger |
|-----------|---------------|-----------------|
| Problem | Help / Suggestion | Post is self-aware → Question |
| Launch | Validate | Overconfident → Contrarian |
| Experience | Validate | Negative experience → Help |
| Guide | Contrarian | Genuinely useful → Validate |
| Comparison | Contrarian | Fair / nuanced → Question |
| Opinion | Contrarian | Resonates → Validate |

### Word Target Rules

These rules determine the `wordTarget` integer the model outputs. The hard cap is enforced in Call 2.

| Platform | Post type | Word target |
|----------|-----------|-------------|
| X (Twitter) | Any | 20–26 |
| Reddit | Problem | 28–38 |
| Reddit | Any other | 22–30 |

Call 2 enforces a hard cap of **50 words** regardless of `wordTarget`.

### ICP Match Criteria

`match: true` requires **all three**:
1. The author is **actively experiencing** the pain — not just discussing it
2. The pain maps directly to one of the listed pain points — not inferentially
3. The signal is unambiguous — if uncertain, return `false`

Disqualifiers:
- Analytical or philosophical post about a related topic
- The author is observing others' pain, not their own
- Connection requires more than one inferential step

### Token Budget

- `max_tokens`: 60 (output JSON is ~55 chars)
- `temperature`: 0.1

---

## Call 2 — Generation Layer (brand path only)

### Purpose

Generate the reply. Extends Call 1's conversation so the model retains brand context and its own analysis. The generation prompt passes the analysis result and instructs the persona.

### Persona

> You are someone who learned English as a second language. Your vocabulary is simple and direct. Your grammar is slightly imperfect — occasional missing articles, short clipped sentences, light word-order variation. But your emotional intelligence is high. You read people well. You know when to push back, when to validate, when to ask the one question that makes someone think. Your replies feel like they came from a real person who actually read the post and had a genuine reaction.

### Generation Instructions (Call 2 user message)

The message passes the analysis result and tells the model:

- Post type `{postType}` → approach it with intent `{intent}`
- Write `{wordTarget}` words — ±4 words acceptable, hard cap 50
- If `match: true` → weave in the product name naturally at the end, 4–6 words, no pitch, no explanation
- If `match: false` → zero product mention, not even implied
- Return only the reply. No quotes, no labels, no explanation.

### Token Budget

- `max_tokens`: 120
- `temperature`: 0.75

---

## No-Brand Path (single call)

### Changes

`STYLE_RULES` replaced with the persona. Word target derived from platform, no analysis step.

### Word Target

| Platform | Word target |
|----------|-------------|
| X (Twitter) | 20–26 words |
| Reddit | 24–32 words |

### Token Budget

- `max_tokens`: 100
- `temperature`: 0.75

---

## What Changes in Code

| Location | Current | New |
|----------|---------|-----|
| `STYLE_RULES` constant | Module-level style list | Removed — persona replaces it |
| No-brand system prompt | STYLE_RULES + word limit | Persona + platform word target |
| Call 1 system prompt | ICP match only | ICP match + post type + intent + word target |
| Call 1 user message | "match true/false?" | "Analyse and return structured JSON" |
| Call 1 `max_tokens` | 20 | 60 |
| Call 2 user message | Static match/no-match blocks | Uses `postType`, `intent`, `wordTarget` from Call 1 |
| Call 2 `max_tokens` | 80 | 120 |
| No-brand `max_tokens` | 80 | 100 |
| Logging | `match` only | `match`, `postType`, `intent`, `wordTarget` |

---

## Error Handling

- If Call 1 JSON parse fails → default to `{ match: false, postType: "Opinion", intent: "Contrarian", wordTarget: 24 }` and proceed to Call 2
- If Call 1 HTTP fails → same defaults, log warning
- No change to Call 2 or no-brand error handling

---

## Out of Scope

- Model selection — stays `google/gemini-2.5-flash-lite` on both calls
- Changing the two-call structure itself
- Adding a third call or streaming
- Persona tuning based on subreddit or platform (future consideration)
