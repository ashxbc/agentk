"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import logo from "@/app/logo.png";

const FAQS = [
  {
    q: "How does AgentK find relevant posts?",
    a: "You set your target keywords and subreddits. AgentK continuously scans Reddit and X for posts that match — filtering out spam, reposts, and off-topic noise in real time. You see only posts with genuine buying intent, ranked by relevance and engagement.",
  },
  {
    q: "Will the replies sound like a bot?",
    a: "No. AgentK is tuned to write like a real founder — conversational, slightly imperfect, genuinely helpful. Each reply is generated from the full post context, so it feels relevant rather than templated.",
  },
  {
    q: "What platforms are supported?",
    a: "Reddit and X (Twitter) are fully supported. On Reddit you can target specific subreddits and set upvote thresholds. On X you get verified-only filters, ratio filters, and advanced search operators. More platforms are on the roadmap.",
  },
  {
    q: "What's included in each plan?",
    a: "Free gives you core access to get started. Pro unlocks higher keyword limits, more reply volume, and priority feed refresh. Ultra removes limits entirely and adds advanced filters and early access to new features.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your keywords and settings are stored securely and never shared or sold. AgentK doesn't read your DMs, post anything without your action, or store the content of replies you don't send.",
  },
  {
    q: "How quickly does the intent feed update?",
    a: "The feed refreshes automatically every 12 hours. You can also force a manual refresh anytime from the extension settings if you want the latest results on demand.",
  },
];

/* ── Chatbot Modal ─────────────────────────────────────────── */

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
      const focusT = setTimeout(() => inputRef.current?.focus(), 350);
      return () => {
        clearTimeout(focusT);
        document.body.style.overflow = "";
      };
    } else {
      const t = setTimeout(() => {
        setMounted(false);
        document.body.style.overflow = "";
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
        role="dialog"
        aria-modal="true"
        aria-label="Chat with agentK"
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "none" }} aria-live="polite" aria-label="Chat messages">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="px-4 py-2.5 rounded-2xl text-sm font-medium leading-relaxed max-w-[82%]"
                style={m.role === "user"
                  ? { backgroundColor: "#DF849D", color: "#fff", borderBottomRightRadius: 6 }
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
              style={{ backgroundColor: "#DF849D" }}
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

/* ── FAQ Components ────────────────────────────────────────── */

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
    <div
      className="border-b transition-all duration-300"
      style={{ borderColor: "rgba(0,0,0,0.05)" }}
    >
      <button
        className="w-full flex items-center justify-between gap-6 py-7 text-left group outline-none"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span
          className="text-lg font-bold tracking-tight transition-colors duration-300"
          style={{ color: open ? "#DF849D" : "#191918" }}
        >
          {q}
        </span>
        <ChevronIcon open={open} />
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
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
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <section className="w-full relative py-40 overflow-hidden" id="faq" aria-label="Frequently asked questions" style={{ backgroundColor: "#FDF7EF" }}>
      
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-20 md:gap-32">

          {/* Left Content */}
          <div className="md:w-[38%] flex-shrink-0">
            <h2 className="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.1] mb-8" style={{ color: "#191918" }}>
              Questions worth <span className="text-[#DF849D] italic">asking.</span>
            </h2>
            <p className="text-lg font-medium leading-relaxed mb-10" style={{ color: "#3D3A36" }}>
              Still have questions? Ask agentK directly and get a real answer in seconds.
            </p>
            
            <button
              onClick={() => setIsChatOpen(true)}
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-sm font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] hover:opacity-95 shadow-lg shadow-pink-100"
              style={{ background: "linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)" }}
            >
              Ask agentK
            </button>
          </div>

          {/* Right Accordion */}
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

      <ChatbotModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </section>
  );
}


