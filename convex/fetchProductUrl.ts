import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const fetchProductInfo = action({
  args: { url: v.string() },
  returns: v.object({
    name: v.string(),
    tagline: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { url }): Promise<{
    name: string;
    tagline: string;
    description: string;
    tags: string[];
    error?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; agentk/1.0)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const name = (titleMatch?.[1] ?? "").trim().slice(0, 80);

      const metaDesc =
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
        "";

      const ogDesc =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        "";

      const rawDesc     = (metaDesc || ogDesc).trim();
      const tagline     = rawDesc.slice(0, 160);
      const description = rawDesc.slice(0, 400);

      const kwMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
      const tags = kwMatch
        ? kwMatch[1].split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8)
        : [];

      return { name, tagline, description, tags };
    } catch (err) {
      return { name: "", tagline: "", description: "", tags: [], error: String(err) };
    }
  },
});
