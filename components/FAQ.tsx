"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "What is AgentK and how does Reddit monitoring work?",
    a: "AgentK is a real-time Reddit monitoring tool that scans any subreddit every 5 minutes for posts matching your keywords. The moment a match is detected, you receive an instant alert via Telegram or Discord. No manual checking, no delays. Simply set your keywords, choose your subreddits, and AgentK runs 24/7 in the background.",
  },
  {
    q: "How fast are the Reddit keyword alerts?",
    a: "AgentK polls Reddit every 5 minutes around the clock. When a new post matches your tracked keywords, the alert fires within seconds of detection, typically under 6 minutes from the moment the post goes live. This makes it one of the fastest Reddit monitoring solutions available, far quicker than manual RSS feeds or third-party digest services.",
  },
  {
    q: "Which notification channels does AgentK support?",
    a: "AgentK delivers alerts via Telegram and Discord. Connect your Telegram account or Discord server from the dashboard in one step, no code required. Each alert includes the post title, subreddit, author, upvote count, comment count, and a direct link to the post so you can act instantly.",
  },
  {
    q: "How many keywords and subreddits can I track?",
    a: "You can track up to 50 keywords and 5 subreddits simultaneously on the free plan. There is no limit on the number of alerts you receive. Keywords are matched case-insensitively against post titles and bodies, so broad terms like 'SaaS tool' and precise phrases like 'looking for Reddit monitoring' both work effectively.",
  },
  {
    q: "Can I filter alerts by upvotes, comments, or author karma?",
    a: "Yes. AgentK includes granular filters so you only get alerted on posts that matter. You can set minimum upvote thresholds, minimum comment counts, and minimum author karma. You can also cap the maximum number of alerts per hour using the /cap command in the settings panel, preventing notification fatigue during high-volume periods.",
  },
  {
    q: "Is AgentK free? Are there hidden costs?",
    a: "AgentK is completely free to use with no credit card required. There are no hidden fees, rate limits, or trial periods. The free plan includes 50 keywords, 5 subreddits, unlimited alerts, Telegram and Discord notifications, and all filtering features. If paid tiers are introduced in the future, existing users will be grandfathered into the free plan.",
  },
  {
    q: "What are the best use cases for Reddit keyword monitoring?",
    a: "AgentK is used by founders tracking competitor mentions, sales teams catching 'looking for a tool like X' posts, marketers monitoring brand sentiment, recruiters finding job-seeking posts, investors tracking industry discussions, and community managers staying on top of their brand name. Any use case that benefits from knowing the moment a topic surfaces on Reddit is a perfect fit.",
  },
  {
    q: "How is AgentK different from Reddit's own notification system?",
    a: "Reddit's native notifications only alert you to activity on posts you've already interacted with. AgentK proactively scans any subreddit for any keyword, including posts from complete strangers, giving you first-mover advantage to comment, DM, or engage before anyone else. It also aggregates multiple subreddits and keywords into a single, unified alert stream.",
  },
  {
    q: "Is my data private and secure?",
    a: "Yes. Your keywords, subreddit list, and account data are stored securely on Convex infrastructure with encrypted transmission (TLS) and hashed authentication. AgentK never posts on your behalf, never accesses your Reddit account, and never shares or sells your data to third parties. See our Privacy Policy for full details.",
  },
  {
    q: "How do I get started with Reddit monitoring?",
    a: "Getting started takes under 2 minutes. Create a free account using Google or email, open the dashboard, enter your keywords, select your subreddits, and connect your Telegram bot or Discord server. AgentK begins monitoring immediately. No setup calls, no onboarding forms, no waiting period.",
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 flex-shrink-0 transition-transform duration-500"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: open ? "#DF849D" : "#B2A28C" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FAQItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b transition-all duration-300" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
      <button
        className="w-full flex items-center justify-between gap-6 py-7 text-left outline-none"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="text-lg font-bold tracking-tight transition-colors duration-300"
          style={{ color: open ? "#DF849D" : "#191918" }}>
          {q}
        </span>
        <ChevronIcon open={open} />
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }}>
        <div style={{ overflow: "hidden" }}>
          <p className="text-base font-medium leading-relaxed pb-8 opacity-70" style={{ color: "#3D3A36" }}>
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="w-full relative py-40 overflow-hidden" id="faq" aria-label="Frequently asked questions about AgentK Reddit monitoring" style={{ backgroundColor: "#FDF7EF" }}>
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-20 md:gap-32">

          <div className="md:w-[38%] flex-shrink-0">
            <h2 className="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.1] mb-8" style={{ color: "#191918" }}>
              Questions worth <span className="text-[#DF849D] italic">asking.</span>
            </h2>
            <p className="text-lg font-medium leading-relaxed" style={{ color: "#3D3A36" }}>
              Everything you need to know about Reddit monitoring, keyword alerts, and how AgentK works.
            </p>
          </div>

          <div className="flex-1 divide-y divide-black/5">
            {FAQS.map((item, i) => (
              <FAQItem
                key={i}
                q={item.q}
                a={item.a}
                open={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
