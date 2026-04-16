"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ── Subreddit color (exact copy from RedditFeed) ─────────────── */

const SUB_PALETTE = [
  "#E04444", "#E8612A", "#D4961A", "#3DAA52",
  "#1A96D4", "#5C6BC0", "#9C27B0", "#E91E73",
  "#00897B", "#FF5722", "#607D8B", "#8D6E63",
  "#43A047", "#039BE5", "#F4511E", "#7E57C2",
];

function getSubredditColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return SUB_PALETTE[h % SUB_PALETTE.length];
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

/* ── Pill (exact copy from RedditFeed) ──────────────────────────── */

function Pill({
  label,
  color = "#FF9A8B",
  textColor = "#462D28",
}: {
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 10px",
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 600,
        background: color,
        color: textColor,
      }}
    >
      {label}
      <svg
        viewBox="0 0 10 10"
        width="8"
        height="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        style={{ opacity: 0.45 }}
      >
        <path d="M2 2l6 6M8 2L2 8" />
      </svg>
    </span>
  );
}

/* ── TagBox static mockup (exact same look as RedditFeed TagBox) ── */

function StaticTagBox({
  pills,
  placeholder,
  pillColor,
  pillTextColor,
}: {
  pills: string[];
  placeholder: string;
  pillColor?: string;
  pillTextColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        alignItems: "center",
        minHeight: "42px",
        padding: "8px 10px",
        borderRadius: "10px",
        border: "1px solid rgba(0,0,0,0.1)",
        background: "#fff",
        cursor: "text",
      }}
    >
      {pills.map((p, i) => (
        <Pill key={p + i} label={p} color={pillColor} textColor={pillTextColor} />
      ))}
      <span style={{ fontSize: "13px", color: "#C4B9AA", userSelect: "none" }}>
        {placeholder}
      </span>
    </div>
  );
}

/* ── FeedModal wrapper (exact copy from RedditFeed FeedModal) ───── */

function MockModal({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "272px",
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "13px 14px 11px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            fontSize: "9px",
            fontWeight: 800,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#B2A28C",
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── Keywords panel ─────────────────────────────────────────────── */

const MOCK_KEYWORDS = ["saas", "b2b tool", "crm", "startup"];
const MOCK_EXCLUDED = ["hiring"];

function KeywordsPanel() {
  return (
    <MockModal title="Reddit Keywords">
      <div style={{ marginBottom: "11px" }}>
        <label
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "#62584F",
            marginBottom: "5px",
            display: "block",
          }}
        >
          Track
        </label>
        <StaticTagBox
          pills={MOCK_KEYWORDS}
          placeholder="e.g. b2b saas…"
        />
        <span
          style={{
            fontSize: "9px",
            color: "#B2A28C",
            marginTop: "2px",
            display: "block",
          }}
        >
          {MOCK_KEYWORDS.length} · Press Enter to add
        </span>
      </div>
      <div>
        <label
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "#62584F",
            marginBottom: "5px",
            display: "block",
          }}
        >
          Exclude
        </label>
        <StaticTagBox
          pills={MOCK_EXCLUDED}
          placeholder="e.g. spam…"
          pillColor="#E2DDD8"
          pillTextColor="#6B6560"
        />
      </div>
    </MockModal>
  );
}

/* ── Subreddits panel ───────────────────────────────────────────── */

const MOCK_SUBREDDITS = ["entrepreneur", "startups", "SaaS", "smallbusiness"];

function SubredditsPanel() {
  return (
    <MockModal title="Subreddits">
      {/* Subreddit input (exact SubredditInput look) */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            height: "38px",
            padding: "0 10px",
            borderRadius: "9px",
            border: "1px solid rgba(0,0,0,0.1)",
            background: "#fff",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#C4B9AA",
              userSelect: "none",
              marginRight: "3px",
            }}
          >
            r/
          </span>
          <span style={{ fontSize: "13px", color: "#C4B9AA", fontFamily: "inherit" }}>
            startup
          </span>
        </div>
        <button
          style={{
            height: "38px",
            padding: "0 10px",
            border: "none",
            background: "none",
            cursor: "default",
            fontSize: "12px",
            fontWeight: 600,
            color: "#B2A28C",
            fontFamily: "inherit",
          }}
        >
          Add
        </button>
      </div>
      {/* Subreddit pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
        {MOCK_SUBREDDITS.map((s) => (
          <Pill key={s} label={s} />
        ))}
      </div>
    </MockModal>
  );
}

/* ── Drag-reveal slider (same logic as original PlatformReveal) ─── */
/* Left side = Keywords, Right side = Subreddits                     */
/* Drag handle left → subreddits; drag handle right → keywords       */

function SettingsSlider() {
  const [split, setSplit] = useState(62);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
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

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        borderRadius: "14px",
        border: "1px solid rgba(0,0,0,0.08)",
        overflow: "hidden",
        height: "270px",
        cursor: "ew-resize",
        userSelect: "none",
        touchAction: "none",
      }}
      onPointerDown={(e) => { dragging.current = true; e.preventDefault(); }}
    >
      {/* Base — Subreddits (right, always visible behind) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#FDF7EF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SubredditsPanel />
      </div>

      {/* Overlay — Keywords (left, clipped to split%) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#FDF7EF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          clipPath: `inset(0 ${100 - split}% 0 0)`,
        }}
      >
        <KeywordsPanel />
      </div>

      {/* Divider line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${split}%`,
          transform: "translateX(-50%)",
          width: 1,
          background: "rgba(0,0,0,0.18)",
          pointerEvents: "none",
        }}
      >
        {/* Handle */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 30,
            height: 30,
            background: "#fff",
            borderRadius: "50%",
            border: "1px solid rgba(0,0,0,0.1)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "-1px" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "-1px" }}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── Post card (pixel-perfect copy of RedditFeed card HTML) ─────── */

const MOCK_POSTS = [
  {
    title: "3 months in, still at 0 users. Starting to think I'm doing something fundamentally wrong.",
    subreddit: "startups",
    author: "john_founder",
    age: "4h",
    ups: 847,
    numComments: 124,
  },
  {
    title: "Anyone using a CRM for cold outreach? What's actually working for B2B?",
    subreddit: "entrepreneur",
    author: "maya_ops",
    age: "1h",
    ups: 312,
    numComments: 58,
  },
  {
    title: "Built a SaaS side project last month — here's everything I learned about getting first users",
    subreddit: "SaaS",
    author: "devguy99",
    age: "2h",
    ups: 1200,
    numComments: 203,
  },
  {
    title: "What b2b tools are you actually paying for in 2025?",
    subreddit: "smallbusiness",
    author: "alex_builds",
    age: "30m",
    ups: 89,
    numComments: 31,
  },
];

// Mirrors BAND_SCATTER positions from RedditFeed (left%, topPx, rotDeg, zIndex)
const CARD_POSITIONS: [string, number, number, number][] = [
  ["4%",  18, -2, 1],
  ["34%", 12,  1, 2],
  ["60%", 20, -1, 1],
  ["17%", 230, 2, 2],
];

function PostCard({
  post,
  left,
  topPx,
  rotDeg,
  zIndex,
}: {
  post: (typeof MOCK_POSTS)[0];
  left: string;
  topPx: number;
  rotDeg: number;
  zIndex: number;
}) {
  const color = getSubredditColor(post.subreddit);
  return (
    <div
      style={{
        position: "absolute",
        width: "265px",
        left,
        top: topPx,
        zIndex,
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid rgba(0,0,0,0.08)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transform: `rotate(${rotDeg}deg)`,
      }}
    >
      {/* Fire icon top-right */}
      <div
        style={{
          position: "absolute",
          top: 9,
          right: 9,
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          zIndex: 2,
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M12 2C9 7 7 10 7 14a5 5 0 0010 0c0-2.5-1.5-5-2.5-6 0 2-1 3.5-2.5 3.5S9.5 10 12 2z"
            fill="#FF6B35"
          />
        </svg>
      </div>

      {/* Card body */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 35px 10px 12px" }}>
        {/* Meta row */}
        <div
          style={{
            fontSize: "9.5px",
            color: "#878a8c",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
            }}
          >
            {/* Reddit alien icon */}
            <svg viewBox="0 0 20 20" width="10" height="10" fill="white">
              <path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.22.22 0 00-.26.16l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.55zM8 11a1 1 0 111 1 1 1 0 01-1-1zm5.37 2.71a3.39 3.39 0 01-2.37.63 3.39 3.39 0 01-2.37-.63.22.22 0 01.31-.31 2.93 2.93 0 002.06.47 2.93 2.93 0 002.06-.47.22.22 0 01.31.31zM13 12a1 1 0 111-1 1 1 0 01-1 1z" />
            </svg>
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}
          >
            <b style={{ color: "#1c1c1c", fontWeight: 700 }}>r/{post.subreddit}</b>
            {" · "}u/{post.author} · {post.age}
          </span>
        </div>

        {/* Title */}
        <div
          style={
            {
              fontSize: "12.5px",
              fontWeight: 600,
              color: "#1c1c1c",
              lineHeight: "1.45",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            } as React.CSSProperties
          }
        >
          {post.title}
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "7px 10px",
          borderTop: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        {/* Upvote pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "#f6f7f8",
            borderRadius: "20px",
            padding: "3px 8px",
          }}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#878a8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#1c1c1c" }}>
            {formatCount(post.ups)}
          </span>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#878a8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* Comments pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            padding: "3px 8px",
            borderRadius: "20px",
            background: "#f6f7f8",
            fontSize: "9.5px",
            fontWeight: 700,
            color: "#878a8c",
          }}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {formatCount(post.numComments)}
        </div>

        {/* Share pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            padding: "3px 8px",
            borderRadius: "20px",
            background: "#f6f7f8",
            fontSize: "9.5px",
            fontWeight: 700,
            color: "#878a8c",
          }}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share
        </div>
      </div>
    </div>
  );
}

function FeedMockup() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "460px",
        background: "#FDF7EF",
        borderRadius: "14px",
        border: "1px solid rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      {MOCK_POSTS.map((post, i) => {
        const [left, topPx, rotDeg, zIndex] = CARD_POSITIONS[i];
        return (
          <PostCard
            key={post.title}
            post={post}
            left={left}
            topPx={topPx}
            rotDeg={rotDeg}
            zIndex={zIndex}
          />
        );
      })}
    </div>
  );
}

/* ── Step 3: Telegram mockup (matches real Telegram Web UI) ─────── */
/* Colors sourced from live Telegram Web component:                   */
/*   bg: #000, bot bubble: #212121, user bubble: #766ac8             */
/*   code: rgba(0,0,0,0.5) bg + #8774e1 text                        */
/*   today label: rgba(72,87,97,0.4)                                 */
/*   timestamp bot: rgba(104,108,114,0.75), user: rgba(255,255,255,0.533) */

function TgBotMsg({ children, ts = "02:10 PM" }: { children: React.ReactNode; ts?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", marginBottom: "4px" }}>
      <div
        style={{
          background: "#212121",
          maxWidth: "300px",
          borderRadius: "15px 15px 15px 0px",
          padding: "5px 8px 6px",
          boxShadow: "rgba(16,16,16,0.61) 0px 1px 2px 0px",
          position: "relative",
        }}
      >
        <div style={{ color: "#fff", fontSize: "15px", lineHeight: "1.3125" }}>{children}</div>
        <span
          style={{
            color: "rgba(104,108,114,0.75)",
            fontSize: "12px",
            float: "right",
            marginLeft: "7px",
            lineHeight: "1.35",
            marginTop: "2px",
          }}
        >
          {ts}
        </span>
      </div>
    </div>
  );
}

function TgUserMsg({ children, ts = "02:10 PM" }: { children: React.ReactNode; ts?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
      <div
        style={{
          background: "#766ac8",
          maxWidth: "300px",
          borderRadius: "15px 15px 0px 15px",
          padding: "5px 8px 6px",
          boxShadow: "rgba(16,16,16,0.61) 0px 1px 2px 0px",
        }}
      >
        <div style={{ color: "#fff", fontSize: "15px", lineHeight: "1.3125" }}>{children}</div>
        <span
          style={{
            color: "rgba(255,255,255,0.533)",
            fontSize: "12px",
            float: "right",
            marginLeft: "7px",
            lineHeight: "1.35",
            marginTop: "2px",
          }}
        >
          {ts}
        </span>
      </div>
    </div>
  );
}

function TelegramMockup({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        background: "#000",
        borderRadius: "14px",
        overflow: "hidden",
        maxWidth: "360px",
        width: "100%",
        fontFamily: "Roboto, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#212121",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#FF9A8B,#DF849D)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          K
        </div>
        <div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1 }}>AgentKBot</div>
          <div style={{ color: "rgba(104,108,114,0.75)", fontSize: 11, marginTop: 2 }}>bot</div>
        </div>
      </div>

      {/* Chat area */}
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column" }}>
        {/* Today */}
        <div style={{ textAlign: "center", margin: "4px 0 8px" }}>
          <span
            style={{
              background: "rgba(72,87,97,0.4)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 500,
              padding: "3px 10px",
              borderRadius: 15,
              lineHeight: "1.3125",
            }}
          >
            Today
          </span>
        </div>

        {/* Bot: welcome */}
        <TgBotMsg>
          👋 Welcome to <strong style={{ fontWeight: 500 }}>Agentk</strong>!
          <br /><br />
          Enter your Agentk Token to connect your alerts:
        </TgBotMsg>

        {/* User: token */}
        <TgUserMsg>4SX8PEMSPUAS</TgUserMsg>

        {/* Bot: connected */}
        <TgBotMsg>
          ✅ <strong style={{ fontWeight: 500 }}>Connected!</strong> You&apos;ll receive Reddit alerts here whenever new posts match your keywords.
        </TgBotMsg>

        {/* Bot: alert (animated in on scroll) */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginBottom: "4px",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(14px)",
            transition: "opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: "300px" }}>
            {/* Alert message — rounded-br-6 because button follows */}
            <div
              style={{
                background: "#212121",
                borderRadius: "15px 15px 6px 6px",
                padding: "5px 8px 6px",
                boxShadow: "rgba(16,16,16,0.61) 0px 1px 2px 0px",
              }}
            >
              <div style={{ color: "#fff", fontSize: "15px", lineHeight: "1.3125" }}>
                🔥 <strong style={{ fontWeight: 500 }}>3 months in, still at 0 users. Is this normal?</strong>
                <br /><br />
                🔑 Keyword:{" "}
                <code
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    color: "#8774e1",
                    fontFamily: "'Cascadia Mono','Roboto Mono',monospace",
                    fontSize: "14px",
                    padding: "1px 2px",
                    borderRadius: "4px",
                  }}
                >
                  saas
                </code>
                <br />
                📌 r/startups<br />
                ⬆️ 847 upvotes · 💬 124 comments<br />
                👤 u/john_founder · 2.3k karma
              </div>
              <span
                style={{
                  color: "rgba(104,108,114,0.75)",
                  fontSize: "12px",
                  float: "right",
                  marginLeft: "7px",
                  lineHeight: "1.35",
                  marginTop: "2px",
                }}
              >
                02:20 PM
              </span>
            </div>

            {/* Go to post inline keyboard button */}
            <button
              style={{
                background: "rgba(72,87,97,0.4)",
                border: "none",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                height: "36px",
                borderRadius: "6px 6px 15px 15px",
                cursor: "default",
                marginTop: "1px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                width: "100%",
                fontFamily: "inherit",
              }}
            >
              🔗 Go to post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Section ────────────────────────────────────────────────── */

export default function SocialProofFlow() {
  const tgRef = useRef<HTMLDivElement>(null);
  const [tgVisible, setTgVisible] = useState(false);

  useEffect(() => {
    const el = tgRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTgVisible(true); },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="w-full max-w-6xl mx-auto px-6 py-40 flex flex-col gap-36"
      aria-label="How agentK works"
    >
      {/* Headline */}
      <div className="text-center">
        <h2
          className="text-4xl md:text-5xl font-normal tracking-normal leading-none"
          style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}
        >
          how would it look like
        </h2>
      </div>

      {/* ── Step 1 ── */}
      <div className="flex flex-col md:flex-row items-center gap-14 md:gap-20">
        <div className="w-full md:w-[38%] text-left space-y-4">
          <p className="text-2xl font-bold text-on-surface leading-snug tracking-tight">
            Set your keywords and subreddits once.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            Tell AgentK what you care about — a handful of keywords, a few subreddits. Drag the handle to switch between panels.
          </p>
        </div>
        <div className="w-full md:w-[62%]">
          <SettingsSlider />
        </div>
      </div>

      {/* ── Step 2 ── */}
      <div className="flex flex-col md:flex-row-reverse items-center gap-14 md:gap-20">
        <div className="w-full md:w-[38%] space-y-4">
          <p className="text-2xl font-bold text-on-surface leading-snug tracking-tight">
            Matching posts surface in your feed.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            Every 2 minutes AgentK scans your subreddits and drops fresh matching posts into your dashboard — upvotes, comments, and author karma visible at a glance.
          </p>
        </div>
        <div className="w-full md:w-[62%]">
          <FeedMockup />
        </div>
      </div>

      {/* ── Step 3 ── */}
      <div className="flex flex-col md:flex-row items-center gap-14 md:gap-20" ref={tgRef}>
        <div className="w-full md:w-[38%] text-left space-y-4">
          <p className="text-2xl font-bold text-on-surface leading-snug tracking-tight">
            Instant Telegram alert the moment it happens.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            No need to check the dashboard. The moment a new matching post goes live, AgentK fires a Telegram message — one tap to open the post and join the conversation.
          </p>
        </div>
        <div className="w-full md:w-[62%] flex justify-center">
          <div className="-rotate-1">
            <TelegramMockup visible={tgVisible} />
          </div>
        </div>
      </div>
    </section>
  );
}
