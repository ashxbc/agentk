---
title: Reply Generation Pipeline Upgrade
date: 2026-04-12
status: approved
---

# Reply Generation Pipeline Upgrade

## Overview

Upgrade `convex/http.ts`'s `/generateReply` endpoint (Path B — brand context present) to produce sharper, more human replies. The changes are: (1) add a `style` classification step inside the existing single LLM call, (2) tighten the persona prompt to the ICP voice, (3) update word count rules.

Path A (no brand context) and all plan gating logic stay unchanged.

---

## Architecture

No structural change. Still a single LLM call returning a JSON object. The JSON shape gains one field:

```json
{"match": true, "style": "Guide", "postType": "Guide", "intent": "Validate", "reply": "..."}
```

Model: `google/gemini-3-flash-preview`  
`max_tokens`: 300 (unchanged)  
`temperature`: 0.75 (unchanged)

---

## Style Classification

Six styles. The LLM picks one in Step 1 before writing the reply in Step 2.

| Style | When to use |
|---|---|
| **Guide** | Post is a how-to, tutorial, or asking for step-by-step help |
| **Experience** | Person is sharing what happened to them — positive or negative |
| **Builder** | Shipped or building something — showing what worked, what didn't |
| **Struggle** | Honest about pain, burnout, failure, or being stuck |
| **Validate** | Looking for agreement or resonance — wants to feel heard |
| **Contrarian** | Strong take or assertion that invites a different perspective |

### Reply pattern per style

The prompt gives the LLM one sentence describing how to write for each style:

- **Guide** → share one specific step or shortcut you actually used, not the textbook answer
- **Experience** → mirror their situation first, then add what you found out the hard way
- **Builder** → say what you shipped, then one honest thing that surprised you
- **Struggle** → acknowledge it plainly and without drama, then one thing that actually helped
- **Validate** → agree sharply and concisely, then add one angle they likely haven't seen yet
- **Contrarian** → state one clear reason you see it differently, no softening, no "but to be fair"

---

## Persona

The reply writer is an indie dev / small SaaS founder / vibe coder from a tier-3 country. English is not their first language. They build things alone, ship fast, have seen wins and failures. They write simply — not because they're dumb, but because English is a second tool.

Existing voice rules stay unchanged:
- Flowing conversational sentences, no fragments, no sentence under 5 words
- Only comma and question mark allowed — no periods, exclamation marks, dashes, or ellipsis
- Lowercase throughout
- Same banned phrases list (50 phrases)

The only change: the system prompt explicitly names the writer persona so the LLM internalises the voice more precisely.

---

## Word Count Rules

| `match` | Word range | Notes |
|---|---|---|
| `false` | 15–28 words | Short, doesn't mean cold. Still a real sentence. |
| `true` | 80–120 words | Enough room to give real value without being a wall of text. |

Previous ranges (20–50 / 80–100) are replaced by these.  
Path A word range stays: 24–32 words, hard cap 50.

---

## Prompt Structure (Path B)

The combined system prompt follows this order:

1. Role framing (analyst + writer in one call)
2. Product context (what, icp, pain points)
3. **Style definitions** (new) — 6 styles with reply patterns
4. Post types (unchanged)
5. Reply intents (unchanged)
6. Intent defaults table (unchanged)
7. Step 1: Analyze — includes style classification alongside existing match/postType/intent
8. Step 2: Write — references chosen style's pattern
9. Word count rules (updated ranges)
10. Banned phrases list
11. Output format — JSON with `match`, `style`, `postType`, `intent`, `reply`

---

## What Does Not Change

- Plan gating (free/pro/ultra) — unchanged
- Path A (no brand) — unchanged
- Pricing gating UX — unchanged
- Extension frontend — unchanged
- All other HTTP routes — unchanged
- OpenRouter model — `google/gemini-3-flash-preview` (unchanged)
- `max_tokens`, `temperature` — unchanged

---

## Files Changed

- `convex/http.ts` — update `combinedSystem` prompt only (lines ~339–405)
