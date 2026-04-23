"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "What is AgentK and how does it find leads on Reddit?",
    a: "AgentK is a free Reddit lead generation tool. It scans subreddits every 5 minutes, 24/7, looking for posts that match your keywords. The moment someone posts 'looking for a CRM' or 'need help with SEO' in your target subreddits, AgentK sends you an instant alert via Telegram or Discord. You reach that lead before any competitor even sees the post.",
  },
  {
    q: "How fast does AgentK detect new leads?",
    a: "AgentK polls Reddit every 5 minutes around the clock. Most alerts land in under 6 minutes from the moment a post goes live. On Reddit, the first relevant reply wins attention. A 6-minute edge over competitors who check Reddit manually is the difference between closing a lead and watching someone else do it.",
  },
  {
    q: "What kind of leads can I find on Reddit?",
    a: "Reddit has over 430 million users across 100,000+ active communities. Subreddits like r/entrepreneur, r/SaaS, r/startups, and r/smallbusiness are full of people asking for tool recommendations, hiring freelancers, describing pain points, and looking for services. Track phrases like 'looking for,' 'recommend a tool,' 'need help with,' or competitor brand names to surface buyer-intent posts the moment they appear.",
  },
  {
    q: "How do Reddit lead alerts get delivered?",
    a: "Alerts go to Telegram or Discord — your choice. Each alert includes the post title, subreddit, author username, upvote count, comment count, and a direct link. Tap the link, read the post, and reply. You can also save any lead to a named list directly from the bot alert — no need to open the dashboard.",
  },
  {
    q: "How many leads can I track at once?",
    a: "Up to 50 keywords and 5 subreddits simultaneously, with no limit on alerts received. That means 50 different buying signals across 5 high-intent communities running in parallel, all day, every day — while you focus on actually talking to leads.",
  },
  {
    q: "Can I filter out low-quality leads?",
    a: "Yes. Set minimum upvote thresholds, minimum comment counts, and minimum author karma to filter out spam, bots, and throwaway accounts. You can also cap max alerts per hour to prevent noise. The result: only real, high-signal posts reach you.",
  },
  {
    q: "Can I save Reddit leads to a list?",
    a: "Yes. Every post in the live feed has a save button. Click it to add the lead to a named list — Prospects, Hot Leads, Follow-Ups. You can also save leads directly from Telegram or Discord bot alerts with one tap, without ever opening the dashboard.",
  },
  {
    q: "Does AgentK have AI-powered lead filtering?",
    a: "Yes. Switch to AI mode in the live feed to filter posts by intent instead of exact keywords. Describe what you're looking for in plain English — for example, 'startup founders looking for a dev tool' — and AgentK uses AI to surface only posts that match that intent. It cuts noise dramatically and finds leads that keyword matching alone would miss.",
  },
  {
    q: "Is AgentK really free?",
    a: "Yes. 100% free. No credit card, no trial, no usage limits, no paid upgrade. Every feature — 50 keywords, 5 subreddits, unlimited alerts, Telegram and Discord notifications, save-to-list, and AI filtering — is included for free, forever. If that ever changes, existing users keep the free plan.",
  },
  {
    q: "How do I start finding leads on Reddit today?",
    a: "Takes 2 minutes. Sign up free with Google or email. Open the dashboard. Enter keywords your future customers would use. Pick the subreddits they hang out in. Connect Telegram or Discord. AgentK starts scanning immediately — no setup call, no onboarding form, no waiting.",
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
    <section className="w-full relative py-40 overflow-hidden" id="faq" aria-label="Frequently asked questions about AgentK Reddit lead generation" style={{ backgroundColor: "#FDF7EF" }}>
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-20 md:gap-32">

          <div className="md:w-[38%] flex-shrink-0">
            <h2 className="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.1] mb-8" style={{ color: "#191918" }}>
              Questions worth <span className="text-[#DF849D] italic">asking.</span>
            </h2>
            <p className="text-lg font-medium leading-relaxed" style={{ color: "#3D3A36" }}>
              Everything you need to know about finding leads on Reddit with AgentK.
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
