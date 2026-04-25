# Demo Chat — Reddit Lead-Gen Chatbot Design

## Goal
A fully functional demo chatbot that finds Reddit leads for any user query using a 6-step agentic pipeline, streamed live to a dark-theme chat UI.

## Architecture

FastAPI serves both the REST/SSE API and the static frontend from a single process. The pipeline runs as a Python generator, emitting Server-Sent Events (SSE) — one per step — to the browser. The frontend consumes the SSE stream and updates the UI in real time.

Upstash Redis caches the full final result per query (cache key = SHA256 of user message, TTL = 6 hours). A cache hit skips all 6 steps and streams the cached result directly.

## File Structure

```
demo_chat/
  main.py            — FastAPI app, /chat SSE endpoint, static file serving
  agent.py           — 6-step pipeline, Instructor models, Groq calls, Redis cache
  reddit_client.py   — HTTPX Reddit fetching, parallel search, dedup, filter, strip
  static/
    index.html       — full frontend: HTML + CSS + JS inline, dark theme
  .env.example       — GROQ_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
  README.md          — one-command setup instructions
```

## Pipeline

### Step 1 — Subreddit Detection
- Input: raw user message
- Model: `llama-3.3-70b-versatile` via LiteLLM + Instructor
- Instructor output model:
  ```python
  class SubredditPlan(BaseModel):
      subreddits: list[str]   # 3-5 names, no r/ prefix
      queries: list[str]      # 3 search query strings
  ```
- Status message: `"Detecting best subreddits..."`

### Step 2 — Reddit Fetch
- HTTPX hits `https://www.reddit.com/r/{sub}/search.json?q={query}&sort=new&limit=25` in parallel (asyncio.gather) for each subreddit × query combination
- Dedup by post ID
- Filter out: no body (`selftext` empty or `[removed]`), 0 comments, created_utc > 30 days ago
- Cap: keep max 50 posts after filter
- Status message: `"Fetching Reddit posts..."`

### Step 3 — Noise Cutting
- Strip each post to exactly: `title`, `body[:300]`, `author`, `score`, `num_comments`, `permalink`
- No LLM call — pure Python
- Status message: `"Cutting noise..."`

### Step 4 — Intent Scoring
- Input: stripped posts (max 30 sent to LLM, rest discarded)
- Token guardrail: truncate posts list until estimated token count ≤ 8k before sending
- Model: `llama-3.3-70b-versatile`
- Instructor output model:
  ```python
  class ScoredPost(BaseModel):
      post_id: str
      score: int          # 1-5 buying intent
      reason: str         # one sentence
  class ScoredResults(BaseModel):
      posts: list[ScoredPost]
  ```
- Keep top 8 by score
- Status message: `"Scoring intent..."`

### Step 5 — Deep Read
- Crawl4AI fetches full page content of top 3 posts (by score)
- Extracts key signals: pain points, urgency language, budget hints
- Truncate each crawled result to 1500 chars
- Status message: `"Reading top posts..."`

### Step 6 — Final Output
- Input: top 8 scored posts (stripped) + top 3 deep-read signals
- Token guardrail: total input must not exceed 10k tokens — truncate deep reads first, then post bodies if needed
- Model: `llama-3.3-70b-versatile`
- Output: narrative summary paragraph + the structured post list is passed through as-is (no Instructor needed here — summary is freeform text)
- Status message: `"Cooking results..."` → `"Here's what I found."`

## Caching

- Library: `upstash-redis` (REST-based, no TCP connection needed)
- Cache key: `SHA256(user_message.strip().lower())`
- TTL: 21600 seconds (6 hours)
- Cached value: JSON blob of `{summary, posts[]}` 
- On cache hit: emit a single SSE event with the cached result, skip all pipeline steps

## Token Budget Enforcement

Every LLM call is preceded by a token estimate (chars / 4 as approximation). If estimated tokens > limit, content is truncated from the bottom of the list until within budget. Hard limits:

| Step | Token limit |
|------|------------|
| Step 1 | 500 |
| Step 4 | 8,000 |
| Step 6 | 10,000 |

## SSE Event Format

Each event is a JSON string:
```json
{"type": "status", "message": "Detecting best subreddits..."}
{"type": "result", "summary": "...", "posts": [...]}
{"type": "error", "message": "Something went wrong"}
```

## Frontend

Single `index.html` file. No build step. No frameworks.

- Dark background (`#0d0d0d`), chat bubble layout
- Status messages render as animated typing indicator (3-dot pulse) that replaces itself when the next step fires
- On `result` event: AI summary renders as a chat bubble, then 8 post cards render below in a responsive grid
- Post card fields: subreddit badge, title (linked), author, score, comments, intent score (1-5 stars), intent reason
- Input: fixed bottom bar, sends on Enter or button click
- SSE connection opens on send, closes on result or error

## Environment Variables

```
GROQ_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Run Command

```bash
cd demo_chat
pip install -r requirements.txt
uvicorn main:app --reload
```

Opens at `http://localhost:8000`.

## Dependencies

```
fastapi
uvicorn
litellm
instructor
httpx
crawl4ai
upstash-redis
python-dotenv
```
