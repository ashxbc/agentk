import hashlib
import json
import os
from typing import AsyncGenerator

import instructor
import litellm
from crawl4ai import AsyncWebCrawler
from dotenv import load_dotenv
from pydantic import BaseModel
from upstash_redis import Redis

from reddit_client import fetch_and_strip

load_dotenv()

# ── Instructor client via LiteLLM
_litellm_client = instructor.from_litellm(litellm.acompletion)

MODEL = "groq/llama-3.3-70b-versatile"

# ── Upstash Redis
_redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"],
)
CACHE_TTL = 21600  # 6 hours


# ── Pydantic models
class SubredditPlan(BaseModel):
    subreddits: list[str]  # 3-5, no r/ prefix
    queries: list[str]     # 3 search strings


class ScoredPost(BaseModel):
    post_id: str
    score: int    # 1-5
    reason: str


class ScoredResults(BaseModel):
    posts: list[ScoredPost]


# ── Token budget helpers
def _estimate_tokens(text: str) -> int:
    return len(text) // 4


def _truncate_to_budget(items: list[dict], budget: int, key: str = "body") -> list[dict]:
    out, total = [], 0
    for item in items:
        cost = _estimate_tokens(json.dumps(item))
        if total + cost > budget:
            break
        out.append(item)
        total += cost
    return out


# ── Cache helpers
def _cache_key(message: str) -> str:
    return "demo_chat:" + hashlib.sha256(message.strip().lower().encode()).hexdigest()


async def _get_cache(key: str) -> dict | None:
    try:
        val = _redis.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


async def _set_cache(key: str, data: dict):
    try:
        _redis.set(key, json.dumps(data), ex=CACHE_TTL)
    except Exception:
        pass


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


# ── Pipeline
async def run_pipeline(message: str) -> AsyncGenerator[str, None]:
    key = _cache_key(message)

    # Cache hit
    cached = await _get_cache(key)
    if cached:
        yield _sse({"type": "status", "message": "⚡ Loaded from cache"})
        yield _sse({"type": "result", **cached})
        return

    # Step 1 — Subreddit detection
    yield _sse({"type": "status", "message": "Detecting best subreddits..."})
    plan: SubredditPlan = await _litellm_client.chat.completions.create(
        model=MODEL,
        max_tokens=300,
        response_model=SubredditPlan,
        messages=[{
            "role": "user",
            "content": (
                f"User query: {message[:400]}\n\n"
                "Return 3-5 subreddit names (no r/ prefix) where this person's target customers hang out, "
                "and 3 Reddit search queries that would surface posts from people with this problem. "
                "Be specific and realistic."
            ),
        }],
    )

    # Step 2 — Reddit fetch
    yield _sse({"type": "status", "message": "Fetching Reddit posts..."})
    posts = await fetch_and_strip(plan.subreddits, plan.queries, cap=50)

    if not posts:
        yield _sse({"type": "error", "message": "No Reddit posts found. Try a different query."})
        return

    # Step 3 — Noise cutting (already done in reddit_client, just announce)
    yield _sse({"type": "status", "message": "Cutting noise..."})
    posts_for_scoring = posts[:30]
    posts_for_scoring = _truncate_to_budget(posts_for_scoring, budget=8000)

    # Step 4 — Intent scoring
    yield _sse({"type": "status", "message": "Scoring intent..."})
    post_lines = "\n".join(
        f"ID:{p['id']} | {p['title']} | {p['body'][:150]}"
        for p in posts_for_scoring
    )
    scored: ScoredResults = await _litellm_client.chat.completions.create(
        model=MODEL,
        max_tokens=600,
        response_model=ScoredResults,
        messages=[{
            "role": "user",
            "content": (
                f"Original query: {message[:200]}\n\n"
                f"Score each Reddit post 1-5 for buying intent (5=strong buying signal, urgent need, "
                f"1=just browsing). Return ALL posts scored.\n\nPosts:\n{post_lines}"
            ),
        }],
    )

    # Map scores back to post dicts, keep top 8
    score_map = {s.post_id: s for s in scored.posts}
    scored_posts = sorted(
        [p for p in posts_for_scoring if p["id"] in score_map],
        key=lambda p: score_map[p["id"]].score,
        reverse=True,
    )[:8]

    # Step 5 — Deep read top 3
    yield _sse({"type": "status", "message": "Reading top posts..."})
    deep_reads: list[dict] = []
    async with AsyncWebCrawler(verbose=False) as crawler:
        for post in scored_posts[:3]:
            try:
                result = await crawler.arun(url=post["permalink"])
                content = (result.markdown or "")[:1500]
                deep_reads.append({"title": post["title"], "content": content})
            except Exception:
                deep_reads.append({"title": post["title"], "content": post["body"]})

    # Step 6 — Final output
    yield _sse({"type": "status", "message": "Cooking results..."})

    deep_text = "\n\n".join(
        f"Post: {d['title']}\n{d['content']}" for d in deep_reads
    )
    scored_summary = "\n".join(
        f"- [{score_map[p['id']].score}/5] {p['title']} (r/{p['subreddit']}): {score_map[p['id']].reason}"
        for p in scored_posts
        if p["id"] in score_map
    )

    combined = f"Query: {message}\n\nTop scored posts:\n{scored_summary}\n\nDeep read signals:\n{deep_text}"
    # Token guardrail for step 6
    while _estimate_tokens(combined) > 9500:
        if deep_reads:
            deep_reads.pop()
            deep_text = "\n\n".join(
                f"Post: {d['title']}\n{d['content']}" for d in deep_reads
            )
        else:
            scored_posts = scored_posts[:-1]
            scored_summary = "\n".join(
                f"- [{score_map[p['id']].score}/5] {p['title']} (r/{p['subreddit']}): {score_map[p['id']].reason}"
                for p in scored_posts
                if p["id"] in score_map
            )
        combined = f"Query: {message}\n\nTop scored posts:\n{scored_summary}\n\nDeep read signals:\n{deep_text}"

    summary_resp = await litellm.acompletion(
        model=MODEL,
        max_tokens=400,
        messages=[{
            "role": "system",
            "content": "You are a Reddit lead-gen analyst. Write a concise 2-3 sentence summary of what you found: the main themes, pain points, and where the best leads are.",
        }, {
            "role": "user",
            "content": combined,
        }],
    )
    summary = summary_resp.choices[0].message.content.strip()

    # Build final post list for frontend
    final_posts = []
    for p in scored_posts:
        sp = score_map.get(p["id"])
        final_posts.append({
            "id":           p["id"],
            "title":        p["title"],
            "subreddit":    p["subreddit"],
            "author":       p["author"],
            "score":        p["score"],
            "num_comments": p["num_comments"],
            "permalink":    p["permalink"],
            "intent_score": sp.score if sp else 0,
            "intent_reason": sp.reason if sp else "",
        })

    result_data = {"summary": summary, "posts": final_posts}
    await _set_cache(key, result_data)

    yield _sse({"type": "status", "message": "Here's what I found."})
    yield _sse({"type": "result", **result_data})
