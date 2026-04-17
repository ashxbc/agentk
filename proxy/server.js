const express  = require("express");
const NodeCache = require("node-cache");
const { ProxyAgent, fetch: undiciFetch } = require("undici");

const app    = express();
const PORT   = process.env.PORT    || 3001;
const API_KEY = process.env.PROXY_API_KEY;

// ── WebShare proxy list ───────────────────────────────────────────────────────
// Format: IP:PORT:USER:PASS,IP:PORT:USER:PASS,...
// Set via WEBSHARE_PROXIES env var on the VPS

const PROXIES = (process.env.WEBSHARE_PROXIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [host, port, user, pass] = s.split(":");
    return { host, port, user, pass };
  });

console.log(`[proxy] loaded ${PROXIES.length} WebShare proxies`);

function randomProxy() {
  if (PROXIES.length === 0) return null;
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

// ── Caches ────────────────────────────────────────────────────────────────────

const subredditCache = new NodeCache({ stdTTL: 30  });
const karmaCache     = new NodeCache({ stdTTL: 300 });
const searchCache    = new NodeCache({ stdTTL: 60  });

// ── In-flight dedup ───────────────────────────────────────────────────────────

const inFlight = new Map();

function dedupFetch(key, fetchFn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = fetchFn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// ── Reddit fetch with rotating proxy + retry ──────────────────────────────────

async function fetchReddit(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const proxy = randomProxy();
    try {
      const options = {
        headers: {
          "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept":          "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      };

      if (proxy) {
        options.dispatcher = new ProxyAgent(
          `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`
        );
      }

      const res = await undiciFetch(url, options);

      if (res.status === 429) {
        console.warn(`[proxy] 429 rate-limited (attempt ${attempt + 1}): ${url}`);
        if (attempt < 2) continue;
        return { status: 429, data: null };
      }
      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        console.warn(`[proxy] HTTP ${res.status} via ${proxy?.host ?? "direct"}: ${url}`);
        if (attempt < 2) continue;
        return { status: res.status, data: null };
      }

      const data = await res.json();
      return { status: 200, data };
    } catch (err) {
      console.error(`[proxy] fetch error (attempt ${attempt + 1}) via ${proxy?.host ?? "direct"}: ${err.message}`);
      if (attempt < 2) continue;
      return { status: 0, data: null };
    }
  }
  return { status: 0, data: null };
}

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) =>
  res.json({ ok: true, pid: process.pid, proxies: PROXIES.length })
);

// Subreddit new posts
app.get("/r/:sub/new", requireApiKey, async (req, res) => {
  const sub      = req.params.sub.toLowerCase();
  const cacheKey = `sub:${sub}`;

  const hit = subredditCache.get(cacheKey);
  if (hit !== undefined) return res.json(hit);

  const { status, data } = await dedupFetch(cacheKey, () =>
    fetchReddit(`https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=100`)
  );

  if (data) { subredditCache.set(cacheKey, data); return res.json(data); }
  return res.status(status || 502).json({ error: "Reddit fetch failed" });
});

// User karma
app.get("/user/:author/about", requireApiKey, async (req, res) => {
  const author   = req.params.author;
  const cacheKey = `karma:${author.toLowerCase()}`;

  const hit = karmaCache.get(cacheKey);
  if (hit !== undefined) return res.json(hit);

  const { status, data } = await dedupFetch(cacheKey, () =>
    fetchReddit(`https://www.reddit.com/user/${encodeURIComponent(author)}/about.json`)
  );

  if (data) { karmaCache.set(cacheKey, data); return res.json(data); }
  return res.status(status || 502).json({ error: "Reddit fetch failed" });
});

// Subreddit autocomplete
app.get("/search/subreddits", requireApiKey, async (req, res) => {
  const query    = (req.query.query || "").trim();
  if (!query) return res.json({ data: { children: [] } });

  const cacheKey = `search:${query.toLowerCase()}`;

  const hit = searchCache.get(cacheKey);
  if (hit !== undefined) return res.json(hit);

  const { status, data } = await dedupFetch(cacheKey, () =>
    fetchReddit(
      `https://www.reddit.com/api/subreddit_autocomplete_v2.json?query=${encodeURIComponent(query)}&limit=6&include_over_18=false&include_profiles=false`
    )
  );

  if (data) { searchCache.set(cacheKey, data); return res.json(data); }
  return res.status(status || 502).json({ error: "Reddit fetch failed" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[proxy] pid=${process.pid} listening on :${PORT}`);
});
