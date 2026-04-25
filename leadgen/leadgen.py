#!/usr/bin/env python3
"""
AgentK LeadGen — Reddit lead generation prototype
Single-script, runs on VPS, Groq-powered.
"""

import os
import sys
import json
import time
import sqlite3
import hashlib
import textwrap
from datetime import datetime, timezone

import httpx
from groq import Groq

# ── optional: scraping
try:
    import trafilatura
    HAS_TRAFILATURA = True
except ImportError:
    HAS_TRAFILATURA = False

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
DB_PATH       = os.path.join(os.path.dirname(__file__), "leadgen.db")
CONFIG_PATH   = os.path.join(os.path.dirname(__file__), "config.json")
POLL_INTERVAL = 600          # seconds between fetch cycles
MAX_POST_AGE  = 3600         # only posts < 1 hour old
CONFIDENCE_THRESHOLD = 0.75

GROQ_BIG   = "llama-3.3-70b-versatile"   # reasoning, onboarding
GROQ_SMALL = "llama-3.1-8b-instant"      # cheap classification

REDDIT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; LeadGen/1.0)"
}

# ─────────────────────────────────────────────────────────────
# DB
# ─────────────────────────────────────────────────────────────
def init_db():
    con = sqlite3.connect(DB_PATH)
    con.execute("""
        CREATE TABLE IF NOT EXISTS seen_posts (
            post_id TEXT PRIMARY KEY,
            processed_at INTEGER
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS sent_alerts (
            post_id TEXT PRIMARY KEY,
            sent_at INTEGER
        )
    """)
    con.commit()
    return con


def already_seen(con, post_id: str) -> bool:
    row = con.execute("SELECT 1 FROM seen_posts WHERE post_id=?", (post_id,)).fetchone()
    return row is not None


def mark_seen(con, post_id: str):
    con.execute("INSERT OR IGNORE INTO seen_posts VALUES (?,?)", (post_id, int(time.time())))
    con.commit()


def already_sent(con, post_id: str) -> bool:
    row = con.execute("SELECT 1 FROM sent_alerts WHERE post_id=?", (post_id,)).fetchone()
    return row is not None


def mark_sent(con, post_id: str):
    con.execute("INSERT OR IGNORE INTO sent_alerts VALUES (?,?)", (post_id, int(time.time())))
    con.commit()


# ─────────────────────────────────────────────────────────────
# GROQ HELPERS
# ─────────────────────────────────────────────────────────────
def groq_chat(client: Groq, model: str, system: str, user: str, temperature: float = 0.3) -> str:
    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content.strip()


def groq_json(client: Groq, model: str, system: str, user: str) -> dict | list:
    resp = client.chat.completions.create(
        model=model,
        temperature=1e-8,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return json.loads(resp.choices[0].message.content)


# ─────────────────────────────────────────────────────────────
# ONBOARDING — FREELANCER / MARKETER
# ─────────────────────────────────────────────────────────────
def onboard_freelancer(client: Groq) -> dict:
    print("\n── Freelancer / Marketer Onboarding ──")
    service    = input("What service do you offer? ").strip()
    customer   = input("Who is your target customer? ").strip()
    pricing    = input("What's your pricing / positioning? ").strip()

    print("\n⏳ Generating ICP and pain points via Groq...")
    result = groq_json(
        client, GROQ_BIG,
        system="You generate ideal customer profiles and pain points. Output valid JSON only.",
        user=f"""
Service: {service}
Target customer: {customer}
Pricing: {pricing}

Generate:
{{
  "product_description": "...",
  "icp": "one paragraph describing the ideal customer",
  "pain_points": ["pain 1", "pain 2", "pain 3", "pain 4", "pain 5"]
}}
""",
    )

    print(f"\n📋 ICP: {result['icp']}")
    print(f"🔥 Pain points:")
    for p in result["pain_points"]:
        print(f"  • {p}")

    confirm = input("\nLooks good? (y to confirm, or type corrections): ").strip()
    if confirm.lower() != "y":
        result["icp"] = confirm if len(confirm) > 10 else result["icp"]

    return result


# ─────────────────────────────────────────────────────────────
# ONBOARDING — BUILDER (URL SCRAPE)
# ─────────────────────────────────────────────────────────────
def scrape_url(url: str) -> str:
    paths = ["", "/about", "/pricing", "/features"]
    texts = []
    for path in paths:
        try:
            r = httpx.get(url.rstrip("/") + path, timeout=10, follow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                if HAS_TRAFILATURA:
                    text = trafilatura.extract(r.text) or ""
                else:
                    # crude fallback: strip tags
                    import re
                    text = re.sub(r"<[^>]+>", " ", r.text)
                    text = re.sub(r"\s+", " ", text)[:3000]
                texts.append(text[:2000])
        except Exception:
            pass
    return "\n\n---\n\n".join(texts)[:8000]


def onboard_builder(client: Groq) -> dict:
    print("\n── Builder Onboarding ──")
    url = input("Enter your product URL: ").strip()

    print(f"\n⏳ Scraping {url}...")
    raw_text = scrape_url(url)
    if not raw_text:
        print("⚠️  Could not scrape — falling back to manual input.")
        raw_text = input("Describe your product briefly: ").strip()

    print("⏳ Extracting product details via Groq...")
    result = groq_json(
        client, GROQ_BIG,
        system="You extract product info from scraped website text. Output valid JSON only.",
        user=f"""
Website text:
{raw_text}

Extract:
{{
  "product_description": "one sentence",
  "icp": "one paragraph — who is the ideal customer",
  "pain_points": ["pain 1", "pain 2", "pain 3", "pain 4", "pain 5"]
}}
""",
    )

    print(f"\n📋 Product: {result['product_description']}")
    print(f"👤 ICP: {result['icp']}")
    print(f"🔥 Pain points:")
    for p in result["pain_points"]:
        print(f"  • {p}")

    confirm = input("\nLooks good? (y to confirm, or type corrections): ").strip()
    if confirm.lower() != "y":
        result["product_description"] = confirm if len(confirm) > 10 else result["product_description"]

    return result


# ─────────────────────────────────────────────────────────────
# SUBREDDIT VALIDATION
# ─────────────────────────────────────────────────────────────
def validate_subreddit(name: str) -> bool:
    try:
        r = httpx.get(
            f"https://www.reddit.com/r/{name}/about.json",
            headers=REDDIT_HEADERS, timeout=8
        )
        if r.status_code != 200:
            return False
        data = r.json()
        subs = data.get("data", {}).get("subscribers", 0)
        return subs >= 5000
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────
# GENERATE SUBREDDITS + INTENTS
# ─────────────────────────────────────────────────────────────
def generate_subreddits_and_intents(client: Groq, profile: dict) -> dict:
    print("\n⏳ Generating subreddits and intents via Groq...")

    result = groq_json(
        client, GROQ_BIG,
        system="You are a Reddit marketing strategist. Output valid JSON only.",
        user=f"""
Product: {profile['product_description']}
ICP: {profile['icp']}
Pain points: {json.dumps(profile['pain_points'])}

Generate:
{{
  "subreddits": ["sub1", "sub2", "sub3", "sub4", "sub5", "sub6", "sub7"],
  "intents": [
    "direct customer problem (under 80 chars)",
    "asking for user experiences or recommendations (under 80 chars)",
    "builder facing problem post-launch (under 80 chars)",
    "urgent or desperate need (under 80 chars)",
    "fifth angle matching the ICP (under 80 chars)"
  ]
}}

Rules:
- Subreddits: real subreddit names, no r/ prefix, where the ICP actually hangs out
- Intents: plain English, under 80 chars each, one angle per intent, targeting THIS specific ICP
""",
    )

    # Validate subreddits
    print("⏳ Validating subreddits (>5k subscribers)...")
    valid_subs = []
    for sub in result.get("subreddits", []):
        if validate_subreddit(sub):
            valid_subs.append(sub)
            print(f"  ✅ r/{sub}")
        else:
            print(f"  ❌ r/{sub} (invalid or <5k subs)")

    if len(valid_subs) < 3:
        print("⚠️  Less than 3 valid subreddits found — add some manually.")
        extra = input("Enter subreddit names separated by commas: ").strip()
        for s in extra.split(","):
            s = s.strip().lstrip("r/")
            if s:
                valid_subs.append(s)

    result["subreddits"] = valid_subs[:7]

    print("\n📡 Subreddits:", ", ".join(f"r/{s}" for s in result["subreddits"]))
    print("\n🎯 Intents:")
    for i, intent in enumerate(result["intents"], 1):
        print(f"  {i}. {intent}")

    confirm = input("\nLooks good? (y to confirm): ").strip()
    if confirm.lower() != "y":
        print("Edit config.json after setup to adjust.")

    return result


# ─────────────────────────────────────────────────────────────
# TELEGRAM
# ─────────────────────────────────────────────────────────────
def send_telegram(bot_token: str, chat_id: str, text: str):
    try:
        httpx.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=10,
        )
    except Exception as e:
        print(f"[TELEGRAM ERROR] {e}")


# ─────────────────────────────────────────────────────────────
# REDDIT FETCH
# ─────────────────────────────────────────────────────────────
def fetch_posts(subreddits: list[str]) -> list[dict]:
    # Join up to 3 subreddits per request
    posts = []
    chunks = [subreddits[i:i+3] for i in range(0, len(subreddits), 3)]
    now = time.time()

    for chunk in chunks:
        joined = "+".join(chunk)
        url = f"https://www.reddit.com/r/{joined}/new.json?limit=100"
        try:
            r = httpx.get(url, headers=REDDIT_HEADERS, timeout=12)
            if r.status_code != 200:
                print(f"[REDDIT] HTTP {r.status_code} for r/{joined}")
                continue
            data = r.json()
            for child in data.get("data", {}).get("children", []):
                p = child.get("data", {})
                age = now - p.get("created_utc", 0)
                if age <= MAX_POST_AGE:
                    posts.append({
                        "id":        p.get("id", ""),
                        "title":     p.get("title", ""),
                        "body":      p.get("selftext", "")[:500],
                        "subreddit": p.get("subreddit", ""),
                        "url":       f"https://reddit.com{p.get('permalink', '')}",
                        "author":    p.get("author", ""),
                        "ups":       p.get("ups", 0),
                    })
        except Exception as e:
            print(f"[REDDIT ERROR] r/{joined}: {e}")
        time.sleep(1)

    return posts


# ─────────────────────────────────────────────────────────────
# CLASSIFICATION
# ─────────────────────────────────────────────────────────────
def classify_post(client: Groq, post: dict, intents: list[str]) -> dict:
    intents_str = "\n".join(f"{i+1}. {intent}" for i, intent in enumerate(intents))

    result = groq_json(
        client, GROQ_SMALL,
        system="You classify Reddit posts against user intents. Output valid JSON only.",
        user=f"""
INTENTS:
{intents_str}

POST TITLE: {post['title']}
POST BODY: {post['body'][:300]}

Does this post match any intent above?

Output:
{{
  "matched": true or false,
  "intent_hit": "the matching intent text, or empty string if no match",
  "confidence": 0.0 to 1.0,
  "reason": "one sentence explaining why it matches or doesn't"
}}
""",
    )
    return result


# ─────────────────────────────────────────────────────────────
# REPLY DRAFT
# ─────────────────────────────────────────────────────────────
def draft_reply(client: Groq, post: dict, profile: dict, intent_hit: str) -> str:
    reply = groq_chat(
        client, GROQ_BIG,
        system="You write natural, helpful Reddit replies that don't sound like ads. Be genuine and concise.",
        user=f"""
Product: {profile['product_description']}
ICP: {profile['icp']}

Reddit post title: {post['title']}
Reddit post body: {post['body'][:400]}
Matched intent: {intent_hit}

Write a short Reddit reply (2-4 sentences) that:
- Acknowledges their specific situation
- Naturally mentions how this product could help
- Ends with a soft CTA (no hard sell)
- Sounds human, not like marketing copy
""",
        temperature=0.6,
    )
    return reply


# ─────────────────────────────────────────────────────────────
# ALERT FORMAT
# ─────────────────────────────────────────────────────────────
def format_alert(post: dict, classification: dict, reply: str) -> str:
    snippet = post["body"][:200].strip() or "(no body)"
    return (
        f"🎯 <b>Lead Match</b>\n"
        f"📌 r/{post['subreddit']} · u/{post['author']} · {post['ups']} upvotes\n\n"
        f"<b>{post['title']}</b>\n"
        f"{snippet}\n\n"
        f"🔑 <i>Intent: {classification['intent_hit']}</i>\n"
        f"💡 <i>Why: {classification['reason']}</i>\n"
        f"📊 Confidence: {classification['confidence']:.0%}\n\n"
        f"🔗 {post['url']}\n\n"
        f"💬 <b>Draft reply:</b>\n{reply}"
    )


# ─────────────────────────────────────────────────────────────
# MONITORING LOOP
# ─────────────────────────────────────────────────────────────
def monitor_loop(config: dict):
    groq_client = Groq(api_key=config["groq_api_key"])
    con = init_db()

    subreddits = config["subreddits"]
    intents    = config["intents"]
    profile    = config["profile"]
    bot_token  = config["telegram_bot_token"]
    chat_id    = config["telegram_chat_id"]

    print(f"\n🚀 Monitoring {len(subreddits)} subreddits | {len(intents)} intents | every {POLL_INTERVAL}s")
    print(f"📡 Subreddits: {', '.join(subreddits)}")
    print("Press Ctrl+C to stop.\n")

    while True:
        cycle_start = time.time()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching posts...")

        posts = fetch_posts(subreddits)
        new_posts = [p for p in posts if not already_seen(con, p["id"])]
        print(f"  Total: {len(posts)} | New: {len(new_posts)}")

        matches = 0
        for post in new_posts:
            mark_seen(con, post["id"])
            if not post["title"]:
                continue

            try:
                classification = classify_post(groq_client, post, intents)
            except Exception as e:
                print(f"  [CLASSIFY ERROR] {post['id']}: {e}")
                continue

            if classification.get("matched") and classification.get("confidence", 0) >= CONFIDENCE_THRESHOLD:
                if not already_sent(con, post["id"]):
                    try:
                        reply = draft_reply(groq_client, post, profile, classification["intent_hit"])
                        alert = format_alert(post, classification, reply)
                        send_telegram(bot_token, chat_id, alert)
                        mark_sent(con, post["id"])
                        matches += 1
                        print(f"  ✅ MATCH: {post['title'][:60]}")
                    except Exception as e:
                        print(f"  [ALERT ERROR] {post['id']}: {e}")

        elapsed = time.time() - cycle_start
        print(f"  Done in {elapsed:.1f}s | {matches} alerts sent\n")

        sleep_time = max(0, POLL_INTERVAL - elapsed)
        time.sleep(sleep_time)


# ─────────────────────────────────────────────────────────────
# SETUP
# ─────────────────────────────────────────────────────────────
def run_setup():
    print("═══════════════════════════════════════")
    print("       AgentK LeadGen — Setup")
    print("═══════════════════════════════════════\n")

    groq_key = input("Groq API key: ").strip()
    client   = Groq(api_key=groq_key)

    role = ""
    while role not in ("freelancer", "marketer", "builder"):
        role = input("Your role (freelancer / marketer / builder): ").strip().lower()

    if role in ("freelancer", "marketer"):
        profile = onboard_freelancer(client)
    else:
        profile = onboard_builder(client)

    generated    = generate_subreddits_and_intents(client, profile)
    bot_token    = input("\nTelegram bot token: ").strip()
    chat_id      = input("Telegram chat ID: ").strip()

    config = {
        "groq_api_key":        groq_key,
        "telegram_bot_token":  bot_token,
        "telegram_chat_id":    chat_id,
        "profile":             profile,
        "subreddits":          generated["subreddits"],
        "intents":             generated["intents"],
    }

    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

    print(f"\n✅ Config saved to {CONFIG_PATH}")
    print("Run `python leadgen.py` again to start monitoring.\n")


# ─────────────────────────────────────────────────────────────
# ENTRY
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if not os.path.exists(CONFIG_PATH):
        run_setup()
    else:
        with open(CONFIG_PATH) as f:
            config = json.load(f)
        monitor_loop(config)
