// LLM-based Reddit post matcher. Called from globalFetch action.
// Returns posts that match at least one of the user's queries.

interface PostInput {
  postId: string;
  title: string;
  body: string;
}

interface MatchResult {
  postId: string;
  matchedQueries: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function matchPostsToQueries(
  posts: PostInput[],
  queries: string[],
  apiKey: string,
): Promise<MatchResult[]> {
  if (posts.length === 0 || queries.length === 0) return [];

  // Token budget: keep posts under 7000 token estimate
  const budgeted: PostInput[] = [];
  let total = 0;
  for (const post of posts) {
    const cost = estimateTokens(`ID:${post.postId} | ${post.title} | ${post.body.slice(0, 200)}`);
    if (total + cost > 7000) break;
    budgeted.push(post);
    total += cost;
  }

  const queryList = queries.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const postList  = budgeted
    .map((p) => `ID:${p.postId} | ${p.title} | ${p.body.slice(0, 200)}`)
    .join("\n");

  const system = `You are a Reddit post classifier. Given search queries and Reddit posts, identify which posts a person would find by searching those queries. A match means the post author is experiencing something directly aligned with the query. Ignore: job postings, vote requests, memes, news without personal angle. Return JSON only.`;

  const user = `Queries:\n${queryList}\n\nPosts:\n${postList}\n\nReturn JSON array: [{"id":"postId","queries":[1,3]},...]  — only posts with ≥1 match. Use query numbers from the list.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        max_tokens: 2048,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`[postMatcher] Groq ${res.status}`);
      return [];
    }

    const json = await res.json();
    const raw  = json.choices?.[0]?.message?.content ?? "{}";

    let items: any[];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed)
        ? parsed
        : (parsed.matches ?? parsed.results ?? parsed.posts ?? []);
    } catch {
      const m = raw.match(/\[[\s\S]*\]/);
      if (!m) return [];
      items = JSON.parse(m[0]);
    }

    const results: MatchResult[] = [];
    for (const item of items) {
      const postId = String(item.id ?? item.postId ?? "");
      if (!postId) continue;
      const nums: number[] = Array.isArray(item.queries) ? item.queries : [];
      const matched = nums.map((n) => queries[n - 1]).filter(Boolean);
      if (matched.length > 0) results.push({ postId, matchedQueries: matched });
    }
    return results;
  } catch (err) {
    console.error("[postMatcher] error:", err);
    return [];
  }
}
