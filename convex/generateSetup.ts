import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

function buildSummary(p: any): string {
  const lines: string[] = [`Role: ${p.role}`];
  if (p.role === "freelancer") {
    if (p.whatTheySell)   lines.push(`Sells: ${p.whatTheySell}`);
    if (p.targetCustomer) lines.push(`Target: ${p.targetCustomer}`);
    if (p.painSignals)    lines.push(`Pain signals: ${p.painSignals}`);
    if (p.proof)          lines.push(`Proof: ${p.proof}`);
  } else if (p.role === "marketer") {
    if (p.marketingSpecialty) lines.push(`Specialty: ${p.marketingSpecialty}`);
    if (p.channels)           lines.push(`Channels: ${p.channels}`);
    if (p.companyTypes)       lines.push(`Company types: ${p.companyTypes}`);
    if (p.companySize)        lines.push(`Company size: ${p.companySize}`);
    if (p.revenueRange)       lines.push(`Revenue range: ${p.revenueRange}`);
    if (p.growthProblem)      lines.push(`Growth problem: ${p.growthProblem}`);
    if (p.clientBottleneck)   lines.push(`Client bottleneck: ${p.clientBottleneck}`);
    if (p.metricsImproved)    lines.push(`Metrics: ${p.metricsImproved}`);
  } else if (p.role === "builder") {
    if (p.productName)        lines.push(`Product: ${p.productName}`);
    if (p.productTagline)     lines.push(`Tagline: ${p.productTagline}`);
    if (p.productDescription) lines.push(`Description: ${p.productDescription}`);
    if (p.revenueModel)       lines.push(`Revenue model: ${p.revenueModel}`);
    if (p.stage)              lines.push(`Stage: ${p.stage}`);
    if (p.userCount)          lines.push(`Users: ${p.userCount}`);
    if (p.revenue)            lines.push(`Revenue: ${p.revenue}`);
    if (p.icpRole)            lines.push(`ICP role: ${p.icpRole}`);
    if (p.icpPainPoints)      lines.push(`ICP pain: ${p.icpPainPoints}`);
    if (p.icpSwitchTrigger)   lines.push(`Switch trigger: ${p.icpSwitchTrigger}`);
  }
  return lines.join("\n");
}

export const generateSetup = action({
  args: {},
  handler: async (ctx): Promise<{ subreddits: string[]; queries: string[] }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.runQuery(internal.userProfile.getProfileByUserId, { userId });
    if (!profile) throw new Error("Profile not found");

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const isBuilder = profile.role === "builder";
    const summary   = buildSummary(profile);

    const system = `You are an expert at Reddit go-to-market strategy. Given a user's profile, output the 10 best subreddits where their ideal customers hang out, and 5 search queries (each ≤80 chars) that surface posts from people actively experiencing the problem this person solves. Queries must sound like natural Reddit searches — not marketing copy. Be specific.${isBuilder ? " Also generate an ICP object." : ""} Return JSON only.`;

    const user = `Profile:\n${summary}\n\nReturn: {"subreddits":["sub1",...10, no r/ prefix],"queries":["query1",...5, each ≤80 chars]${isBuilder ? ',"icp":{"whoBluefit":"...","role":"...","painPoints":"...","switchTrigger":"..."}' : ""}}`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        max_tokens: 1000,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });

    if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);

    const json   = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");

    const subreddits: string[] = (parsed.subreddits ?? [])
      .slice(0, 10)
      .map((s: string) => s.replace(/^r\//i, "").trim())
      .filter(Boolean);

    const queries: string[] = (parsed.queries ?? [])
      .slice(0, 5)
      .map((q: string) => q.slice(0, 80).trim())
      .filter(Boolean);

    await ctx.runMutation(internal.userQueries.saveQueriesInternal, { userId, subreddits, queries });

    if (isBuilder && parsed.icp) {
      await ctx.runMutation(internal.userProfile.patchIcp, {
        userId,
        icpWhoBluefit:    parsed.icp.whoBluefit   ?? undefined,
        icpRole:          parsed.icp.role         ?? undefined,
        icpPainPoints:    parsed.icp.painPoints   ?? undefined,
        icpSwitchTrigger: parsed.icp.switchTrigger ?? undefined,
      });
    }

    return { subreddits, queries };
  },
});
