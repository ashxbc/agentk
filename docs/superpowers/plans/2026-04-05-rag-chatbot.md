# AgentK RAG Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a RAG-based chatbot for the AgentK FAQ modal using Groq's llama-3.3-70b-versatile, with a ~600-word knowledge base injected as system context and a full chat UI replacing the current static modal.

**Architecture:** Knowledge base (~600 words / ~800 tokens) is small enough to inject in full as the system prompt on every request — no vector DB or embedding API needed. The Convex HTTP action `/chatbot` accepts `{ message, history }`, prepends the KB as system context, calls Groq, and returns `{ reply }`. The frontend maintains message history locally and streams it with each request to preserve conversation context.

**Tech Stack:** Groq API (`llama-3.3-70b-versatile`), Convex HTTP actions, Next.js / React, TypeScript.

---

### Task 1: Add `/chatbot` Convex HTTP action with knowledge base

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Add the knowledge base constant and route**

In `convex/http.ts`, before `export default http;`, add:

```typescript
const AGENTK_KB = `
# AgentK — Product Knowledge Base

## What is AgentK?
AgentK is a Chrome extension that helps indie hackers, SaaS founders, and early-stage builders find buying-intent conversations on Reddit and X (Twitter) — and reply instantly with context-aware, human-like messages that convert readers into users.

Instead of cold outreach or paid ads, AgentK monitors platforms where your future customers are already talking about their problems, surfaces the most relevant posts, and generates replies that feel genuine — not promotional.

## Who is AgentK for?
- Indie hackers launching or growing solo products
- SaaS founders in early customer-acquisition mode
- B2B builders looking for organic, conversation-driven growth
- Anyone tired of paying for ads that don't convert

If you've ever manually searched Reddit for posts mentioning your problem space and tried to reply helpfully — AgentK automates that entire workflow.

## Core Features

### Keyword Monitoring
Set target keywords (e.g. "B2B SaaS", "cold outreach", "AI writing") and exclusion terms. AgentK continuously scans Reddit and X for posts and comments that match — filtered in real time, noise removed.

### Intent Feed
A curated, ranked feed of posts with genuine buying intent. Filters out spam, low-quality posts, and unrelated discussions. You see only what matters, sorted by relevance and engagement.

### Human-Like Reply Generation
Click any post. AgentK reads the full context and generates a reply that sounds like a real founder — not a bot, not a pitch. Simple English, conversational tone, directly helpful.

### Context Awareness
AgentK understands the sentiment, the question being asked, and the buyer's stage — so replies feel relevant and timely, not templated. Each reply is unique to the post.

### On-Page Assist (X.com)
When browsing X, an AgentK icon appears next to the reply button on relevant tweets. Click it — a reply is generated in seconds, ready to post with one tap.

### Reddit + X Coverage
Both platforms supported. Reddit: subreddit targeting, upvote thresholds, comment scanning. X: verified-only filter, ratio filters, advanced search operators.

## Pricing
AgentK is free to install and use during early access. Paid tiers are planned with limits on keywords, reply volume, and platform connections. Early users keep their access locked at launch pricing.

## Why AgentK vs. Manual Monitoring?
Manual community monitoring is slow, inconsistent, and exhausting. AgentK:
- Runs 24/7 while you focus on building
- Surfaces intent you'd miss scrolling by hand
- Generates replies in seconds, not minutes
- Keeps your tone consistent across every interaction

## Why AgentK vs. Generic AI Tools?
Generic AI tools don't know where to look or what to say in context. AgentK is purpose-built for community-led growth:
- Platform-native (Reddit + X, not generic web)
- Intent-filtered (not just keyword hits)
- Reply-ready (not just surfacing content)

## Getting Started
Install the Chrome extension → set your keywords and subreddits → open AgentK → intent feed populates within minutes → reply to your first post directly from the extension.

## Common Questions
- Does it work for B2C? Yes — especially consumer SaaS, productivity tools, creator economy products.
- Will replies sound robotic? No — tuned to write like a real founder: conversational, slightly imperfect, genuinely helpful.
- How often does the feed refresh? Every 12 hours automatically. Force-refresh anytime from settings.
- Is my data private? Yes — keywords and settings stored locally and on a secure backend. Never shared or sold.
- What platforms are supported? Reddit and X (Twitter) currently. More platforms planned.
- Is there an API? Not yet — currently extension-only.
`.trim();

http.route({
  path: "/chatbot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { message, history = [] } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const systemPrompt = `You are agentK's helpful assistant. Answer questions about agentK using only the knowledge base below. Be conversational, warm, and concise. Replies must be 40 words or fewer. Never make up features or pricing not in the knowledge base. If you don't know, say "I'm not sure — try reaching out to the team directly."

KNOWLEDGE BASE:
${AGENTK_KB}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6), // keep last 3 exchanges for context
      { role: "user", content: message },
    ];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let res: Response;
      try {
        res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages,
            max_tokens: 80,
            temperature: 0.6,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("[agentK] Groq error:", errText);
        throw new Error(`Groq responded ${res.status}`);
      }

      const json = await res.json();
      const reply = (json.choices?.[0]?.message?.content ?? "").trim();
      if (!reply) throw new Error("Empty response from model");

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err: any) {
      console.error("[agentK] chatbot error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/chatbot",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd d:/agentk && npx tsc --noEmit
```
Expected: no errors (or only pre-existing ones).

- [ ] **Step 3: Set GROQ_API_KEY in Convex env**

```bash
npx convex env set GROQ_API_KEY <value-from-.env.local>
```
Expected: `✔ Successfully set GROQ_API_KEY`

- [ ] **Step 4: Deploy**

```bash
npx convex dev --once
```
Expected: `✔ Convex functions ready!`

---

### Task 2: Replace ChatbotModal in FAQ.tsx with full chat UI

**Files:**
- Modify: `components/FAQ.tsx`

- [ ] **Step 1: Replace the ChatbotModal component**

Replace the entire `ChatbotModal` function (lines 36–117) with:

```tsx
const CONVEX_SITE_URL = "https://savory-lynx-906.convex.site";

type Message = { role: "user" | "assistant"; content: string };

function ChatbotModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hey! I'm agentK. Ask me anything about the product — how it works, pricing, features, anything." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 350);
    } else {
      const t = setTimeout(() => {
        setMounted(false);
        document.body.style.overflow = "unset";
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const history = nextMessages
        .slice(-7, -1) // last 3 exchanges before current
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${CONVEX_SITE_URL}/chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed");
      setMessages(prev => [...prev, { role: "assistant", content: json.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
      style={{ backgroundColor: "rgba(25, 25, 24, 0.4)" }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[420px] h-[600px] flex flex-col transition-all duration-300 ease-out ${isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"}`}
        style={{ backgroundColor: "#ffffff", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.09)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "#edeff1" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#FDF7EF] flex items-center justify-center flex-shrink-0">
              <Image src={logo} alt="agentK" width={22} height={22} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-[#191918] leading-none">Chat with agentK</p>
              <p className="text-[11px] text-[#B2A28C] mt-0.5">Usually replies instantly</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#FDF7EF] transition-colors" aria-label="Close">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="#191918" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "none" }}>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="px-4 py-2.5 rounded-2xl text-sm font-medium leading-relaxed max-w-[82%]"
                style={m.role === "user"
                  ? { background: "linear-gradient(135deg,#ff9472 0%,#f2709c 100%)", color: "#fff", borderBottomRightRadius: 6 }
                  : { backgroundColor: "#FDF7EF", color: "#3D3A36", borderBottomLeftRadius: 6 }
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl bg-[#FDF7EF]" style={{ borderBottomLeftRadius: 6 }}>
                <div className="flex gap-1 items-center h-4">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#DF849D] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t" style={{ borderColor: "#edeff1" }}>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border" style={{ borderColor: "#edeff1", backgroundColor: "#FDF7EF" }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about agentK…"
              className="flex-1 bg-transparent border-none outline-none text-sm font-medium placeholder:text-[#B2A28C] text-[#191918]"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="flex items-center justify-center w-8 h-8 rounded-lg active:scale-90 transition-all flex-shrink-0 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#ff9472 0%,#f2709c 100%)" }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `useRef` to imports**

Ensure the import line at the top reads:
```tsx
import { useState, useEffect, useRef } from "react";
```

- [ ] **Step 3: Verify dev server compiles with no errors**

```bash
cd d:/agentk && npm run dev
```
Expected: no TypeScript/Next.js compile errors in terminal.

---

### Task 3: Wire env + smoke test

- [ ] **Step 1: Confirm GROQ_API_KEY is in .env.local**

```bash
grep GROQ_API_KEY d:/agentk/.env.local
```
Expected: `GROQ_API_KEY=gsk_...`

- [ ] **Step 2: Set in Convex if not already done**

```bash
cd d:/agentk && npx convex env set GROQ_API_KEY <value>
npx convex dev --once
```
Expected: `✔ Convex functions ready!`

- [ ] **Step 3: Manual smoke test**

1. Open `http://localhost:3000`
2. Scroll to FAQ section → click "Ask agentK"
3. Type: `"What is agentK?"`
4. Expected: reply in ≤ 2 seconds, ≤ 40 words, accurate

5. Type: `"How much does it cost?"`
6. Expected: mentions free early access, ≤ 40 words

7. Type: `"Does it work on LinkedIn?"`
8. Expected: says LinkedIn not supported, only Reddit and X
