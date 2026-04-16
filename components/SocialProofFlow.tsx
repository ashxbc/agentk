"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import logo from "@/app/logo.png";

const REPLY_TEXT =
  `hey, went through the same thing honestly. what actually worked was stopping trying to "announce" and just finding conversations where people were already venting the exact problem I solved — threads like this one.\n\ntook about a week of consistent replies before signups started coming in. the trick is not sounding like you're pitching. you're just... answering.\n\ngood luck w it`;

/* ── Icons ─────────────────────────────────────────────── */

const RedditLogo = () => (
  <Image src="/reddit.logo.png" alt="Reddit" width={24} height={24} className="w-full h-full object-contain" />
);

const GenericAvatar = () => (
  <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
    <circle cx="20" cy="20" r="20" fill="#cfd8dc" />
    <circle cx="20" cy="15" r="7" fill="#90a4ae" />
    <path d="M4 40 Q4 28 20 28 Q36 28 36 40" fill="#90a4ae" />
  </svg>
);

const UpvoteIcon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[14px] h-[14px]" fill="none">
    <path d="M12 4 L20 14 H15 V20 H9 V14 H4 Z" fill={active ? "#FF4500" : "#878a8c"} />
  </svg>
);

const DownvoteIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[14px] h-[14px]" fill="none">
    <path d="M12 20 L4 10 H9 V4 H15 V10 H20 Z" fill="#878a8c" />
  </svg>
);

const CommentIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#878a8c">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
  </svg>
);

const ShareRedditIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#878a8c">
    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
  </svg>
);

const XVerified = () => (
  <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]">
    <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C1.63 9.33.75 10.57.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.52.8-3.91c1.32-.67 2.2-1.91 2.2-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" fill="#1d9bf0" />
  </svg>
);

const XReplyIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z" />
  </svg>
);

const XRepostIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
    <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
  </svg>
);

const XLikeIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]">
    <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" fill={filled ? "#f91880" : "none"} stroke={filled ? "#f91880" : "currentColor"} strokeWidth={filled ? 0 : 2} />
  </svg>
);

const XBookmarkIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M6 3h12l1 1v17l-7-4.5L5 21V4z" />
  </svg>
);

const XViewsIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 4-6" />
  </svg>
);

const XMoreIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
);

/* ── Platform Reveal (drag divider) ─────────────────────── */

function PlatformReveal({ withReply }: { withReply?: boolean }) {
  const [split, setSplit] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setSplit(pct);
  }, []);

  const onUp = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove, onUp]);

  const height = withReply ? 320 : 230;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden select-none touch-none cursor-ew-resize"
      style={{ height }}
      onPointerDown={(e) => { dragging.current = true; e.preventDefault(); }}
    >
      {/* Base layer — Reddit (always visible, right side shows through) */}
      <div className="absolute inset-0 p-5 bg-white overflow-hidden">
        <RedditPost withReply={withReply} />
      </div>

      {/* Overlay layer — X (clipped to left portion) */}
      <div
        className="absolute inset-0 p-5 bg-white overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      >
        <XPost withReply={withReply} />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: `${split}%`, transform: "translateX(-50%)", width: 1, background: "rgba(0,0,0,0.25)" }}
      >
        {/* Handle */}
        <div
          className="absolute top-1/2 left-1/2 flex items-center justify-center rounded-full bg-white"
          style={{ width: 32, height: 32, transform: "translate(-50%, -50%)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", border: "1px solid rgba(0,0,0,0.1)" }}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 -mr-0.5" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 -ml-0.5" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </div>
      </div>
    </div>
  );
}

/* ── Reddit Post ─────────────────────────────────────────── */

function RedditPost({ withReply }: { withReply?: boolean }) {
  return (
    <div style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif" }}>
      {/* Community header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 leading-none">
          <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0"><RedditLogo /></div>
          <span className="text-[13px] font-bold leading-none" style={{ color: "#1c1c1c" }}>r/startups</span>
          <span className="text-[12px] leading-none" style={{ color: "#878a8c" }}>•</span>
          <span className="text-[12px] leading-none" style={{ color: "#878a8c" }}>4 hr. ago</span>
        </div>
        {/* Username indented to align with subreddit name: icon 24px + gap 8px = 32px */}
        <div className="flex items-center mt-1" style={{ paddingLeft: 32 }}>
          <span className="text-[12px] leading-none" style={{ color: "#878a8c" }}>john</span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-semibold leading-snug mb-1.5" style={{ color: "#1c1c1c" }}>
        3 months in, still at 0 users. Starting to think I'm doing something fundamentally wrong.
      </h3>

      {/* Body */}
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: "#3c3c3c" }}>
        Tried cold email, Product Hunt, Twitter threads, posting in communities. I get likes but no signups. Every "growth hack" I try feels like shouting into a void. Is this normal or am I missing something obvious?
      </p>

      {/* Reply thread — step 3 */}
      {withReply && (
        <div className="flex gap-2 mb-3">
          <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
            <div className="w-[2px] flex-1 rounded-full" style={{ background: "#edeff1", minHeight: 56 }} />
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 bg-primary-fixed flex items-center justify-center">
                <Image src={logo} alt="AgentK" width={14} height={14} />
              </div>
              <span className="text-[12px] font-bold leading-none" style={{ color: "#0079d3" }}>AgentK</span>
              <span className="text-[11px] leading-none" style={{ color: "#878a8c" }}>• 2 min. ago</span>
            </div>
            <p className="text-[12px] leading-relaxed mb-2" style={{ color: "#3c3c3c" }}>
              hey, went through the same thing honestly. what actually worked was stopping trying to "announce" and just finding conversations where people were already venting the exact problem I solved — threads like this one. took a week of consistent replies before signups started.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-full px-2 py-1 gap-1.5" style={{ background: "#f6f7f8" }}>
                <UpvoteIcon active /><span className="text-[11px] font-bold leading-none" style={{ color: "#FF4500" }}>24</span><DownvoteIcon />
              </div>
              <button className="text-[11px] font-bold hover:bg-gray-100 rounded px-1.5 py-1 transition-colors" style={{ color: "#878a8c" }}>Reply</button>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <div className="flex items-center rounded-full px-2.5 py-1.5 gap-1.5" style={{ background: "#f6f7f8" }}>
          <UpvoteIcon /><span className="text-[12px] font-bold leading-none" style={{ color: "#1c1c1c" }}>847</span><DownvoteIcon />
        </div>
        <button className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 hover:bg-gray-100 transition-colors" style={{ background: "#f6f7f8" }}>
          <CommentIcon /><span className="text-[12px] font-bold leading-none" style={{ color: "#878a8c" }}>124 Comments</span>
        </button>
        <button className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 hover:bg-gray-100 transition-colors" style={{ background: "#f6f7f8" }}>
          <ShareRedditIcon /><span className="text-[12px] font-bold leading-none" style={{ color: "#878a8c" }}>Share</span>
        </button>
        <button className="flex items-center rounded-full px-2.5 py-1.5 hover:bg-gray-100 transition-colors" style={{ background: "#f6f7f8" }} aria-label="More options">
          <span className="text-[12px] font-bold leading-none" style={{ color: "#878a8c" }}>···</span>
        </button>
      </div>
    </div>
  );
}

/* ── X Post ──────────────────────────────────────────────── */

function XPost({ withReply }: { withReply?: boolean }) {
  return (
    <div style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif" }}>
      <div className="flex gap-3">
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0"><GenericAvatar /></div>
          {withReply && <div className="w-0.5 flex-1 mt-1" style={{ background: "#eff3f4", minHeight: 20 }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className="text-[15px] font-bold" style={{ color: "#0f1419" }}>John</span>
            <span className="inline-flex items-center" style={{ verticalAlign: "middle", marginBottom: 1 }}><XVerified /></span>
            <span className="text-[14px]" style={{ color: "#536471" }}>@john</span>
            <span className="text-[14px]" style={{ color: "#536471" }}>4h</span>
            <button className="ml-auto p-1 rounded-full hover:bg-gray-100 transition-colors" style={{ color: "#536471" }} aria-label="More options"><XMoreIcon /></button>
          </div>
          <p className="text-[15px] leading-normal mb-3" style={{ color: "#0f1419" }}>
            3 months building. still 0 real users. tried cold DMs, PH, threads. feels like talking to myself lol. is this just the game or am I actually cooked?
          </p>
          <div className="flex items-center justify-between max-w-xs">
            <button className="flex items-center gap-1 group hover:text-blue-500 transition-colors" style={{ color: "#536471" }} aria-label="Reply">
              <span className="p-1.5 rounded-full group-hover:bg-blue-50 transition-colors"><XReplyIcon /></span>
              <span className="text-[13px]">89</span>
            </button>
            <button className="flex items-center gap-1 group hover:text-green-500 transition-colors" style={{ color: "#536471" }} aria-label="Repost">
              <span className="p-1.5 rounded-full group-hover:bg-green-50 transition-colors"><XRepostIcon /></span>
              <span className="text-[13px]">47</span>
            </button>
            <button className="flex items-center gap-1 group hover:text-pink-500 transition-colors" style={{ color: "#536471" }} aria-label="Like">
              <span className="p-1.5 rounded-full group-hover:bg-pink-50 transition-colors"><XLikeIcon /></span>
              <span className="text-[13px]">312</span>
            </button>
            <button className="flex items-center gap-1 group hover:text-blue-500 transition-colors" style={{ color: "#536471" }} aria-label="Views">
              <span className="p-1.5 rounded-full group-hover:bg-blue-50 transition-colors"><XViewsIcon /></span>
              <span className="text-[13px]">18K</span>
            </button>
            <button className="p-1.5 rounded-full hover:bg-blue-50 transition-colors" style={{ color: "#536471" }} aria-label="Bookmark"><XBookmarkIcon /></button>
          </div>
        </div>
      </div>

      {withReply && (
        <>
          <div className="h-px my-3" style={{ background: "#eff3f4" }} />
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-primary-fixed flex items-center justify-center">
              <Image src={logo} alt="AgentK" width={28} height={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span className="text-[15px] font-bold" style={{ color: "#0f1419" }}>AgentK</span>
                <span className="text-[14px]" style={{ color: "#536471" }}>@agentk</span>
                <span className="text-[14px]" style={{ color: "#536471" }}>2m</span>
              </div>
              <p className="text-[13px] mb-1" style={{ color: "#536471" }}>
                Replying to <span style={{ color: "#1d9bf0" }}>@john</span>
              </p>
              <p className="text-[15px] leading-normal mb-3" style={{ color: "#0f1419" }}>
                hey, went through the same thing honestly. what actually worked was stopping trying to "announce" and just finding conversations where people were already venting the exact problem I solved — threads like this one. took a week before signups started 👋
              </p>
              <div className="flex items-center justify-between max-w-xs">
                <button className="flex items-center gap-1 group hover:text-blue-500 transition-colors" style={{ color: "#536471" }} aria-label="Reply">
                  <span className="p-1.5 rounded-full group-hover:bg-blue-50 transition-colors"><XReplyIcon /></span>
                  <span className="text-[13px]">3</span>
                </button>
                <button className="flex items-center gap-1 group hover:text-green-500 transition-colors" style={{ color: "#536471" }} aria-label="Repost">
                  <span className="p-1.5 rounded-full group-hover:bg-green-50 transition-colors"><XRepostIcon /></span>
                  <span className="text-[13px]">7</span>
                </button>
                <button className="flex items-center gap-1 group hover:text-pink-500 transition-colors" style={{ color: "#536471" }} aria-label="Like">
                  <span className="p-1.5 rounded-full group-hover:bg-pink-50 transition-colors"><XLikeIcon filled /></span>
                  <span className="text-[13px]" style={{ color: "#f91880" }}>24</span>
                </button>
                <button className="flex items-center gap-1 group hover:text-blue-500 transition-colors" style={{ color: "#536471" }} aria-label="Views">
                  <span className="p-1.5 rounded-full group-hover:bg-blue-50 transition-colors"><XViewsIcon /></span>
                  <span className="text-[13px]">841</span>
                </button>
                <button className="p-1.5 rounded-full hover:bg-blue-50 transition-colors" style={{ color: "#536471" }} aria-label="Bookmark"><XBookmarkIcon /></button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


/* ── Main Section ───────────────────────────────────────── */

export default function SocialProofFlow() {
  const [typedText, setTypedText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          setTimeout(() => {
            let i = 0;
            const interval = setInterval(() => {
              if (i < REPLY_TEXT.length) {
                setTypedText(REPLY_TEXT.slice(0, i + 1));
                i++;
              } else {
                clearInterval(interval);
                setShowReply(true);
              }
            }, 16);
          }, 900);
        }
      },
      { threshold: 0.4 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const cardStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "20px 20px 18px",
    boxShadow: "none",
    border: "1px solid #edeff1",
  };

  return (
    <section className="w-full max-w-6xl mx-auto px-6 py-40 flex flex-col gap-36" aria-label="How agentK works">
      
      {/* Editorial Headline */}
      <div className="text-center">
        <h2 className="text-4xl md:text-5xl font-normal tracking-normal leading-none" style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}>
          how would it look like
        </h2>
      </div>

      {/* ── Step 1 ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center gap-14 md:gap-20 relative z-10">
        <div className="w-full md:w-[38%] text-left space-y-4">
          <p className="text-2xl font-bold text-on-surface leading-snug tracking-tight">
            Surfaces the posts where people are already asking for you.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            AgentK scans Reddit and X in real-time, detecting buying intent buried inside frustrated, searching posts — before your competitors even notice.
          </p>
        </div>
        <div className="w-full md:w-[62%] flex justify-center">
          <div className="w-full max-w-md rotate-2 overflow-hidden" style={{ ...cardStyle, padding: 0 }}>
            <PlatformReveal />
          </div>
        </div>
      </div>

      {/* ── Step 2 ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row-reverse items-center gap-14 md:gap-20 relative z-10">
        <div className="w-full md:w-[38%] space-y-4">
          <p className="text-2xl font-bold text-on-surface leading-snug tracking-tight">
            A reply that sounds like a person, not a product.
          </p>
          <div
            className="rounded-2xl p-4 text-sm text-on-surface leading-relaxed font-body overflow-hidden"
            style={{ background: "rgba(147,69,93,0.04)", border: "1px solid rgba(147,69,93,0.12)", height: 240, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {typedText}{!showReply && <span className="typing-cursor" aria-hidden="true" />}
          </div>
        </div>

        {/* AgentK card — mesh gradient, logo + generating only */}
        <div className="w-full md:w-[62%] flex justify-center" ref={cardRef}>
          <div
            className="-rotate-2 w-full max-w-md relative overflow-hidden"
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #edeff1",
              minHeight: 200,
            }}
          >
            {/* Mesh blobs removed */}


            {/* Centred content */}
            <div className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
              {/* Pure Logo (no container bg/outline) */}
              <Image src={logo} alt="AgentK" width={32} height={32} className="opacity-90 logo-rotate-pulse" />
              
              {/* Generating status only */}
              <span className="text-sm font-medium tracking-tight" style={{ color: "#878a8c" }}>
                Generating reply…
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 3 ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center gap-14 md:gap-20 relative z-10">
        <div className="w-full md:w-[38%] text-left space-y-4">
          <p className="text-2xl font-bold text-on-surface leading-snug tracking-tight">
            One reply. One new user. Done consistently, it becomes a system.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            Your reply goes live inside the conversation. Not an ad. Not a cold DM. A genuine answer at exactly the right moment.
          </p>
        </div>
        <div className="w-full md:w-[62%] flex justify-center">
          <div className="w-full max-w-md rotate-1 overflow-hidden" style={{ ...cardStyle, padding: 0 }}>
            <PlatformReveal withReply />
          </div>
        </div>
      </div>
    </section>
  );
}
