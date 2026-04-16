"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "How does AgentK find relevant posts?",
    a: "You set keywords and subreddits. AgentK scans them every 2 minutes and fires a Telegram alert the moment a matching post goes live. No delays, no manual checking.",
  },
  {
    q: "What platforms does it monitor?",
    a: "Reddit. You can track any subreddit, set keyword filters, minimum upvotes, and minimum comments. Telegram is used for real-time alerts.",
  },
  {
    q: "Is there really no limit on keywords or subreddits?",
    a: "None. Add as many keywords and subreddits as you want. AgentK fetches them all on every cycle.",
  },
  {
    q: "How do Telegram alerts work?",
    a: "Connect your Telegram account from the dashboard in one step. Every time a new matching post is found, you get an instant message with the post title, subreddit, upvotes, and a direct link.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your keywords and settings are stored securely and never shared or sold. AgentK doesn't post anything on your behalf.",
  },
  {
    q: "Will it stay free?",
    a: "Yes. AgentK is free with no usage caps. If paid plans are ever introduced, existing users will be grandfathered.",
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
    <section className="w-full relative py-40 overflow-hidden" id="faq" aria-label="Frequently asked questions" style={{ backgroundColor: "#FDF7EF" }}>
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-20 md:gap-32">

          <div className="md:w-[38%] flex-shrink-0">
            <h2 className="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.1] mb-8" style={{ color: "#191918" }}>
              Questions worth <span className="text-[#DF849D] italic">asking.</span>
            </h2>
            <p className="text-lg font-medium leading-relaxed" style={{ color: "#3D3A36" }}>
              Everything you need to know before you start.
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
