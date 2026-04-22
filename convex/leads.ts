import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// ── Lists ─────────────────────────────────────────────────────────────────────

export const getLists = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const lists = await ctx.db
      .query("leadLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const counts = await Promise.all(
      lists.map(async (l) => {
        const rows = await ctx.db
          .query("leads")
          .withIndex("by_list", (q) => q.eq("listId", l._id))
          .collect();
        return { ...l, count: rows.length };
      }),
    );
    return counts.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const createList = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const clean = name.trim().slice(0, 60);
    if (!clean) return null;
    return await ctx.db.insert("leadLists", { userId, name: clean, createdAt: Date.now() });
  },
});

export const renameList = mutation({
  args: { listId: v.id("leadLists"), name: v.string() },
  handler: async (ctx, { listId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId) return;
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    await ctx.db.patch(listId, { name: clean });
  },
});

export const deleteList = mutation({
  args: { listId: v.id("leadLists") },
  handler: async (ctx, { listId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId) return;
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(listId);
  },
});

// ── Leads ─────────────────────────────────────────────────────────────────────

export const getLeads = query({
  args: { listId: v.id("leadLists") },
  handler: async (ctx, { listId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId) return [];
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    return rows.sort((a, b) => b.addedAt - a.addedAt);
  },
});

export const addLead = mutation({
  args: {
    listId:      v.id("leadLists"),
    postId:      v.string(),
    source:      v.string(),
    title:       v.string(),
    url:         v.string(),
    subreddit:   v.string(),
    author:      v.string(),
    ups:         v.number(),
    numComments: v.number(),
    createdUtc:  v.number(),
    query:       v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const list = await ctx.db.get(args.listId);
    if (!list || list.userId !== userId) return;
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_list_post", (q) => q.eq("listId", args.listId).eq("postId", args.postId))
      .first();
    if (existing) return;
    await ctx.db.insert("leads", {
      userId,
      ...args,
      addedAt: Date.now(),
    });
  },
});

export const removeLead = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.userId !== userId) return;
    await ctx.db.delete(leadId);
  },
});
