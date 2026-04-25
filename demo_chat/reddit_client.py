import asyncio
import time
from typing import Any

import httpx

REDDIT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

THIRTY_DAYS_SEC = 30 * 24 * 3600


async def _fetch_one(client: httpx.AsyncClient, subreddit: str, query: str) -> list[dict]:
    url = f"https://www.reddit.com/r/{subreddit}/search.json"
    params = {"q": query, "sort": "new", "limit": 25, "restrict_sr": "on"}
    try:
        r = await client.get(url, params=params, headers=REDDIT_HEADERS, timeout=12)
        if r.status_code != 200:
            return []
        children = r.json().get("data", {}).get("children", [])
        return [c["data"] for c in children]
    except Exception:
        return []


def _is_valid(post: dict) -> bool:
    body = post.get("selftext", "")
    if not body or body in ("[removed]", "[deleted]"):
        return False
    if post.get("num_comments", 0) == 0:
        return False
    age = time.time() - post.get("created_utc", 0)
    if age > THIRTY_DAYS_SEC:
        return False
    return True


def _strip(post: dict) -> dict:
    return {
        "id":           post.get("id", ""),
        "title":        post.get("title", ""),
        "body":         post.get("selftext", "")[:300],
        "author":       post.get("author", ""),
        "score":        post.get("score", 0),
        "num_comments": post.get("num_comments", 0),
        "subreddit":    post.get("subreddit", ""),
        "permalink":    "https://reddit.com" + post.get("permalink", ""),
    }


async def fetch_and_strip(subreddits: list[str], queries: list[str], cap: int = 50) -> list[dict]:
    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_one(client, sub, q)
            for sub in subreddits
            for q in queries
        ]
        results = await asyncio.gather(*tasks)

    seen: set[str] = set()
    posts: list[dict] = []
    for batch in results:
        for raw in batch:
            pid = raw.get("id", "")
            if pid in seen:
                continue
            if not _is_valid(raw):
                continue
            seen.add(pid)
            posts.append(_strip(raw))
            if len(posts) >= cap:
                return posts
    return posts
