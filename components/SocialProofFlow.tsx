"use client";

import { useState, useEffect, useRef } from "react";

/* ════════════════════════════════════════════════════════════════════════════
   Shared primitives — kept pixel-identical to the live dashboard UIs
   ════════════════════════════════════════════════════════════════════════════ */

const SUB_PALETTE = [
  "#E04444", "#E8612A", "#D4961A", "#3DAA52",
  "#1A96D4", "#5C6BC0", "#9C27B0", "#E91E73",
  "#00897B", "#FF5722", "#607D8B", "#8D6E63",
  "#43A047", "#039BE5", "#F4511E", "#7E57C2",
];

function getSubredditColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return SUB_PALETTE[h % SUB_PALETTE.length];
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

const EASE_OUT    = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_SPRING = "cubic-bezier(0.34, 1.36, 0.64, 1)";
const EASE_IN_OUT = "cubic-bezier(0.76, 0, 0.24, 1)";

/* Hook: start animation when element is first scrolled into view. */
function useInView<T extends Element>(threshold = 0.3): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/* Hook: drives a looping stage machine once `active` is true and no manual
   stage override is set. Stages advance on their timers, then loop back to 0
   after totalMs. `stageTimings` and `totalMs` must be stable references. */
function useLoopedStages(active: boolean, stageTimings: readonly number[], totalMs: number): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    function run() {
      if (cancelled) return;
      setStage(0);
      stageTimings.forEach((t, i) => {
        timers.push(setTimeout(() => { if (!cancelled) setStage(i + 1); }, t));
      });
      timers.push(setTimeout(run, totalMs));
    }
    run();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [active, stageTimings, totalMs]);
  return stage;
}

/* Hook: types a string character-by-character once `active` is true.
   Returns the substring currently visible. */
function useTypewriter(text: string, active: boolean, startDelay = 0, charMs = 55): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) { setIdx(0); return; }
    let cancelled = false;
    const start = setTimeout(() => {
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i++;
        setIdx(i);
        if (i < text.length) setTimeout(tick, charMs);
      };
      tick();
    }, startDelay);
    return () => { cancelled = true; clearTimeout(start); setIdx(0); };
  }, [text, active, startDelay, charMs]);
  return text.slice(0, idx);
}

function Pill({
  label, color = "#FF9A8B", textColor = "#462D28",
}: { label: string; color?: string; textColor?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 9999,
      fontSize: 12, fontWeight: 600, background: color, color: textColor,
    }}>
      {label}
      <svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ opacity: 0.45 }}>
        <path d="M2 2l6 6M8 2L2 8" />
      </svg>
    </span>
  );
}

function MockModal({
  title, children, width = 296,
}: { title: string; children: React.ReactNode; width?: number }) {
  return (
    <div style={{
      width, background: "#fff", borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.08)", padding: "13px 14px 11px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#B2A28C" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Stage frame — shared scene container with entrance zoom + loop reset fade
   ════════════════════════════════════════════════════════════════════════════ */

function StageFrame({
  visible, children, height = 460,
}: { visible: boolean; children: React.ReactNode; height?: number }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height,
      background: "#FDF7EF",
      borderRadius: 16,
      border: "1px solid rgba(0,0,0,0.08)",
      overflow: "hidden",
      opacity: visible ? 1 : 0,
      transform: visible ? "scale(1)" : "scale(0.96)",
      transition: `opacity 0.9s ${EASE_OUT}, transform 1.1s ${EASE_OUT}`,
    }}>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Post card — mirrors RedditFeed card
   ════════════════════════════════════════════════════════════════════════════ */

type MockPost = {
  title: string; subreddit: string; author: string; age: string;
  ups: number; numComments: number;
};

function PostCard({
  post, style, showBookmark, bookmarkFilled,
}: {
  post: MockPost;
  style?: React.CSSProperties;
  showBookmark?: boolean;
  bookmarkFilled?: boolean;
}) {
  const color = getSubredditColor(post.subreddit);
  return (
    <div style={{
      width: 265,
      background: "#fff",
      borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.08)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}>
      {/* Fire icon top-right */}
      <div style={{ position: "absolute", top: 9, right: showBookmark ? 36 : 9, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, zIndex: 2 }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path d="M12 2C9 7 7 10 7 14a5 5 0 0010 0c0-2.5-1.5-5-2.5-6 0 2-1 3.5-2.5 3.5S9.5 10 12 2z" fill="#FF6B35" />
        </svg>
      </div>

      {/* Bookmark */}
      {showBookmark && (
        <div style={{
          position: "absolute", top: 9, right: 9, width: 22, height: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 6, zIndex: 3,
          color: bookmarkFilled ? "#DF849D" : "#B2A28C",
          transition: `color 0.2s ${EASE_OUT}`,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={bookmarkFilled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 42px 10px 12px" }}>
        <div style={{ fontSize: 9.5, color: "#878a8c", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: color, flexShrink: 0 }}>
            <svg viewBox="0 0 20 20" width="10" height="10" fill="white">
              <path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.22.22 0 00-.26.16l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.55zM8 11a1 1 0 111 1 1 1 0 01-1-1zm5.37 2.71a3.39 3.39 0 01-2.37.63 3.39 3.39 0 01-2.37-.63.22.22 0 01.31-.31 2.93 2.93 0 002.06.47 2.93 2.93 0 002.06-.47.22.22 0 01.31.31zM13 12a1 1 0 111-1 1 1 0 01-1 1z" />
            </svg>
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
            <b style={{ color: "#1c1c1c", fontWeight: 700 }}>r/{post.subreddit}</b>{" · "}u/{post.author} · {post.age}
          </span>
        </div>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: "#1c1c1c", lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
        } as React.CSSProperties}>
          {post.title}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f6f7f8", borderRadius: 20, padding: "3px 8px" }}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#878a8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#1c1c1c" }}>{formatCount(post.ups)}</span>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#878a8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 20, background: "#f6f7f8", fontSize: 9.5, fontWeight: 700, color: "#878a8c" }}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {formatCount(post.numComments)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 20, background: "#f6f7f8", fontSize: 9.5, fontWeight: 700, color: "#878a8c" }}>
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

/* ════════════════════════════════════════════════════════════════════════════
   SCENE 1 — Normal mode: keyword typing → post reveal
   ════════════════════════════════════════════════════════════════════════════ */

const N_KEYWORDS = ["saas", "b2b tool", "crm", "startup"];
const N_EXCLUDED = "hiring";

const N_POSTS: MockPost[] = [
  { title: "3 months in, still at 0 users. Starting to think I'm doing something fundamentally wrong.", subreddit: "startups",      author: "john_founder", age: "4h",  ups: 847,  numComments: 124 },
  { title: "Anyone using a CRM for cold outreach? What's actually working for B2B?",                    subreddit: "entrepreneur",  author: "maya_ops",     age: "1h",  ups: 312,  numComments: 58  },
  { title: "Built a SaaS side project last month. Here's everything I learned about getting first users", subreddit: "SaaS",        author: "devguy99",     age: "2h",  ups: 1200, numComments: 203 },
  { title: "What b2b tools are you actually paying for in 2025?",                                       subreddit: "smallbusiness", author: "alex_builds",  age: "30m", ups: 89,   numComments: 31  },
];

const N_POST_POS: [string, number, number, number][] = [
  ["4%",  28, -2, 1],
  ["34%", 14,  1, 2],
  ["60%", 34, -1, 1],
  ["17%", 240, 2, 2],
];

/* Stable module-scope timings so useLoopedStages doesn't re-run each render. */
const N_STAGE_TIMINGS = [150, 3200, 4200, 4600, 9500] as const;
const N_TOTAL_MS = 10000;
const N_KW_OFFSETS = N_KEYWORDS.map((_, i) => 150 + i * 600);

/* Stage timeline for Scene 1 (ms from activation):
   0    → zoom-in starts
   500  → begin typing keywords
   3200 → begin typing exclusion
   4200 → transition: settings slides out, feed slides in
   4600 → posts begin appearing
   5600 → all posts in
   9500 → loop restart */
function NormalModeScene({ visible }: { visible: boolean }) {
  const stage = useLoopedStages(visible, N_STAGE_TIMINGS, N_TOTAL_MS);
  const typingActive = stage >= 1 && stage < 3;
  const onFeed = stage >= 3;

  return (
    <StageFrame visible={visible} height={460}>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex",
        width: "200%",
        transform: onFeed ? "translateX(-50%)" : "translateX(0%)",
        transition: `transform 0.95s ${EASE_IN_OUT}`,
      }}>
        {/* ── View A: settings (keywords panel) ── */}
        <div style={{
          width: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <MockModal title="Reddit Keywords" width={304}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "#62584F", marginBottom: 6, display: "block" }}>Track</label>
              <KeywordLiveInput
                active={typingActive && stage === 1}
                keywords={N_KEYWORDS}
                offsets={N_KW_OFFSETS}
                allPills={stage >= 2}
              />
              <span style={{ fontSize: 9, color: "#B2A28C", marginTop: 4, display: "block" }}>
                Press Enter to add
              </span>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "#62584F", marginBottom: 6, display: "block" }}>Exclude</label>
              <ExclusionLiveInput
                text={N_EXCLUDED}
                active={stage === 2}
                asPill={stage >= 3}
              />
            </div>
          </MockModal>
        </div>

        {/* ── View B: feed with animated post reveal ── */}
        <div style={{ width: "50%", flexShrink: 0, position: "relative" }}>
          {N_POSTS.map((post, i) => {
            const [left, topPx, rot, z] = N_POST_POS[i];
            const show = stage >= 4;
            const delay = show ? i * 110 : 0;
            return (
              <div key={post.title} style={{
                position: "absolute", left, top: topPx, zIndex: z,
                opacity: show ? 1 : 0,
                transform: show
                  ? `rotate(${rot}deg) translateY(0) scale(1)`
                  : `rotate(${rot}deg) translateY(44px) scale(0.94)`,
                transition: `opacity 0.7s ${EASE_OUT} ${delay}ms, transform 0.85s ${EASE_SPRING} ${delay}ms`,
              }}>
                <PostCard post={post} />
              </div>
            );
          })}
        </div>
      </div>

    </StageFrame>
  );
}

function KeywordLiveInput({
  keywords, offsets, active, allPills,
}: { keywords: string[]; offsets: number[]; active: boolean; allPills: boolean }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      minHeight: 42, padding: "8px 10px", borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.1)", background: "#fff", cursor: "text",
    }}>
      {keywords.map((kw, i) => (
        <KeywordSlot key={kw} text={kw} startDelay={offsets[i]} active={active} forcePill={allPills} />
      ))}
      {!allPills && (
        <span style={{ fontSize: 13, color: "#C4B9AA", userSelect: "none" }}>e.g. b2b saas…</span>
      )}
    </div>
  );
}

function KeywordSlot({
  text, startDelay, active, forcePill,
}: { text: string; startDelay: number; active: boolean; forcePill: boolean }) {
  const typed = useTypewriter(text, active, startDelay, 50);
  const committed = forcePill || (active && typed.length === text.length);

  if (committed) return <Pill label={text} />;
  if (!active || typed.length === 0) return null;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 9999,
      fontSize: 12, fontWeight: 600,
      background: "rgba(255,154,139,0.25)", color: "#6B3A34",
      border: "1px dashed rgba(255,154,139,0.65)",
    }}>
      {typed}
      <span style={{
        display: "inline-block", width: 1, height: 11, background: "#6B3A34",
        marginLeft: 2, animation: "agentk-caret 1s steps(2) infinite",
      }} />
    </span>
  );
}

function ExclusionLiveInput({
  text, active, asPill,
}: { text: string; active: boolean; asPill: boolean }) {
  const typed = useTypewriter(text, active, 100, 55);
  const committed = asPill || (active && typed.length === text.length);

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      minHeight: 42, padding: "8px 10px", borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.1)", background: "#fff", cursor: "text",
    }}>
      {committed ? (
        <Pill label={text} color="#E2DDD8" textColor="#6B6560" />
      ) : active && typed.length > 0 ? (
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "3px 10px", borderRadius: 9999,
          fontSize: 12, fontWeight: 600,
          background: "rgba(226,221,216,0.6)", color: "#6B6560",
          border: "1px dashed rgba(107,101,96,0.4)",
        }}>
          {typed}
          <span style={{ display: "inline-block", width: 1, height: 11, background: "#6B6560", marginLeft: 2, animation: "agentk-caret 1s steps(2) infinite" }} />
        </span>
      ) : (
        <span style={{ fontSize: 13, color: "#C4B9AA", userSelect: "none" }}>e.g. spam…</span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SCENE 2 — AI mode: intent typing → AI post reveal
   ════════════════════════════════════════════════════════════════════════════ */

const AI_INTENTS = [
  "devs sharing what worked to get first users",
  "founders struggling with cold outreach",
  "people comparing CRMs for B2B sales",
];

const AI_POSTS: MockPost[] = [
  { title: "0$ marketing, 8.9% conv rate, 3100 users after 2 months — here's the playbook",  subreddit: "SaaS",         author: "tina_ships",  age: "2h",  ups: 1843, numComments: 267 },
  { title: "Cold outreach is killing me. I've sent 400 emails, 2 replies. What am I missing?", subreddit: "startups",    author: "mark_b2b",    age: "45m", ups: 234,  numComments: 89  },
  { title: "Attio vs HubSpot vs Pipedrive — which one for a 4-person B2B sales team?",         subreddit: "smallbusiness", author: "rita_ops",   age: "3h",  ups: 512,  numComments: 141 },
];

const AI_POST_POS: [string, number, number, number][] = [
  ["6%",  34, -1.5, 1],
  ["38%", 18,  1,   2],
  ["22%", 234, -1,  2],
];

const AI_STAGE_TIMINGS = [150, 3600, 4000, 4500, 9500] as const;
const AI_TOTAL_MS = 10000;
const AI_INTENT_OFFSETS = [120, 1250, 2400];

function AiModeScene({ visible }: { visible: boolean }) {
  const stage = useLoopedStages(visible, AI_STAGE_TIMINGS, AI_TOTAL_MS);
  const typingActive = stage === 1;
  const onFeed = stage >= 3;

  return (
    <StageFrame visible={visible} height={460}>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex",
        width: "200%",
        transform: onFeed ? "translateX(-50%)" : "translateX(0%)",
        transition: `transform 0.95s ${EASE_IN_OUT}`,
      }}>
        {/* ── View A: AI Intent modal ── */}
        <div style={{ width: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MockModal title="AI Intent" width={340}>
            <p style={{ fontSize: 11, color: "#B2A28C", margin: "0 0 10px" }}>
              Describe what you're looking for. Up to 3 intents.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {AI_INTENTS.map((intent, i) => (
                <AiIntentRow
                  key={intent}
                  idx={i + 1}
                  text={intent}
                  active={typingActive}
                  startDelay={AI_INTENT_OFFSETS[i]}
                  forceDone={stage >= 2}
                />
              ))}
            </div>
          </MockModal>
        </div>

        {/* ── View B: AI feed ── */}
        <div style={{ width: "50%", flexShrink: 0, position: "relative" }}>
          {AI_POSTS.map((post, i) => {
            const [left, topPx, rot, z] = AI_POST_POS[i];
            const show = stage >= 4;
            const delay = show ? i * 130 : 0;
            return (
              <div key={post.title} style={{
                position: "absolute", left, top: topPx, zIndex: z,
                opacity: show ? 1 : 0,
                transform: show
                  ? `rotate(${rot}deg) translateY(0) scale(1)`
                  : `rotate(${rot}deg) translateY(44px) scale(0.94)`,
                transition: `opacity 0.7s ${EASE_OUT} ${delay}ms, transform 0.85s ${EASE_SPRING} ${delay}ms`,
              }}>
                <PostCard post={post} />
              </div>
            );
          })}
        </div>
      </div>

    </StageFrame>
  );
}

function AiIntentRow({
  idx, text, active, startDelay, forceDone,
}: { idx: number; text: string; active: boolean; startDelay: number; forceDone: boolean }) {
  const typed = useTypewriter(text, active && !forceDone, startDelay, 22);
  const display = forceDone ? text : typed;
  const showCaret = active && !forceDone && display.length > 0 && display.length < text.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {/* Inbox icon (matches real dashboard) */}
      <button style={{
        width: 22, height: 22, flexShrink: 0, border: "none", padding: 0,
        borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", color: "#C4B9AA", cursor: "default",
      }}>
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8l2-5h10l2 5"/>
          <rect x="2" y="8" width="16" height="9" rx="1.5"/>
        </svg>
      </button>
      <div style={{
        flex: 1,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid rgba(0,0,0,0.1)",
        fontSize: 12,
        color: "#191918",
        background: "#FAFAF8",
        minHeight: 32,
        display: "flex", alignItems: "center",
        fontFamily: "inherit",
      }}>
        {display || <span style={{ color: "#C4B9AA" }}>Intent {idx}…</span>}
        {showCaret && (
          <span style={{ display: "inline-block", width: 1, height: 12, background: "#191918", marginLeft: 1, animation: "agentk-caret 1s steps(2) infinite" }} />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SCENE 3 — Conversion: post → bookmark → lead added → spreadsheet
   ════════════════════════════════════════════════════════════════════════════ */

const CONV_POST: MockPost = {
  title: "Anyone using a CRM for cold outreach? What's actually working for B2B?",
  subreddit: "entrepreneur", author: "maya_ops", age: "1h",
  ups: 312, numComments: 58,
};

const SPREADSHEET_ROWS: Array<{
  title: string; subreddit: string; author: string; ups: number; comments: number; age: string; query: string;
}> = [
  { title: "Anyone using a CRM for cold outreach? What's actually working for B2B?",  subreddit: "entrepreneur",  author: "maya_ops",    ups: 312,  comments: 58,  age: "1h",  query: "crm"      },
  { title: "3 months in, still at 0 users. Is this normal for early SaaS?",           subreddit: "startups",      author: "john_founder",ups: 847,  comments: 124, age: "4h",  query: "saas"     },
  { title: "Built a SaaS side project last month. Here's what I learned.",            subreddit: "SaaS",          author: "devguy99",    ups: 1200, comments: 203, age: "2h",  query: "saas"     },
  { title: "What b2b tools are you actually paying for in 2025?",                     subreddit: "smallbusiness", author: "alex_builds", ups: 89,   comments: 31,  age: "30m", query: "b2b tool" },
  { title: "Cold outreach is killing me — 400 emails, 2 replies. What am I missing?", subreddit: "startups",      author: "mark_b2b",    ups: 234,  comments: 89,  age: "45m", query: "startup"  },
];

const CONV_STAGE_TIMINGS = [150, 1200, 2200, 2700, 3600, 4300, 9500] as const;
const CONV_TOTAL_MS = 10000;

function ConversionScene({ visible }: { visible: boolean }) {
  const stage = useLoopedStages(visible, CONV_STAGE_TIMINGS, CONV_TOTAL_MS);

  const postVisible = stage >= 1 && stage < 5;
  const zoomed      = stage >= 2 && stage < 5;
  const clicked     = stage >= 3;
  const toastOn     = stage >= 4 && stage < 5;
  const onSheet     = stage >= 5;

  return (
    <StageFrame visible={visible} height={460}>
      {/* Post card stage */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: postVisible ? 1 : 0,
        transition: `opacity 0.6s ${EASE_OUT}`,
        pointerEvents: "none",
      }}>
        <div style={{
          position: "relative",
          transform: zoomed ? "scale(1.35) translateX(-40px)" : "scale(1)",
          transformOrigin: "center right",
          transition: `transform 0.9s ${EASE_OUT}`,
        }}>
          <PostCard post={CONV_POST} />
        </div>
      </div>

      {/* Lead added toast */}
      <div style={{
        position: "absolute", top: 24, left: "50%",
        transform: toastOn ? "translate(-50%, 0) scale(1)" : "translate(-50%, -18px) scale(0.94)",
        opacity: toastOn ? 1 : 0,
        transition: `opacity 0.45s ${EASE_OUT}, transform 0.55s ${EASE_SPRING}`,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(18px) saturate(160%)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 12,
        padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
        zIndex: 20,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: "linear-gradient(135deg,#FF9A8B,#DF849D)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1c1c", letterSpacing: "-0.01em" }}>Lead added</div>
          <div style={{ fontSize: 11, color: "#6e6e73", marginTop: 1 }}>Saved to “Prospects”</div>
        </div>
      </div>

      {/* Spreadsheet lead list */}
      <div style={{
        position: "absolute", inset: 0,
        padding: "16px",
        opacity: onSheet ? 1 : 0,
        transform: onSheet ? "scale(1) translateY(0)" : "scale(0.96) translateY(18px)",
        transition: `opacity 0.7s ${EASE_OUT}, transform 0.9s ${EASE_OUT}`,
        pointerEvents: "none",
      }}>
        <LeadSheet active={onSheet} />
      </div>
    </StageFrame>
  );
}

function LeadSheet({ active }: { active: boolean }) {
  const BORDER = "rgba(0,0,0,0.08)";
  const HEAD   = "#B2A28C";
  const TEXT   = "#191918";
  const BODY   = "#3F3A33";
  const MUTED  = "#8B8070";
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#fff",
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Sheet header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 6,
            background: "linear-gradient(135deg,#FF9A8B,#DF849D)",
          }}>
            <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>Prospects</span>
          <span style={{ fontSize: 11, color: MUTED, padding: "1px 7px", borderRadius: 9999, background: "rgba(0,0,0,0.04)" }}>
            {SPREADSHEET_ROWS.length}
          </span>
        </div>
        <div style={{ fontSize: 11, color: MUTED }}>Export CSV</div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: BODY, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "8%" }}  />
            <col style={{ width: "11%" }} />
            <col style={{ width: "7%" }}  />
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Subreddit</Th>
              <Th>Author</Th>
              <Th align="right">Ups</Th>
              <Th align="right">Comm.</Th>
              <Th align="right">Age</Th>
              <Th>Query</Th>
            </tr>
          </thead>
          <tbody>
            {SPREADSHEET_ROWS.map((row, i) => (
              <tr key={row.title} style={{
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0)" : "translateY(10px)",
                transition: `opacity 0.45s ${EASE_OUT} ${150 + i * 90}ms, transform 0.55s ${EASE_OUT} ${150 + i * 90}ms`,
              }}>
                <td style={{ ...cellBase(i === 0), color: TEXT, fontWeight: 600 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
                </td>
                <td style={{ ...cellBase(i === 0) }}>r/{row.subreddit}</td>
                <td style={{ ...cellBase(i === 0) }}>u/{row.author}</td>
                <td style={{ ...cellBase(i === 0), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.ups}</td>
                <td style={{ ...cellBase(i === 0), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.comments}</td>
                <td style={{ ...cellBase(i === 0), textAlign: "right", color: MUTED }}>{row.age}</td>
                <td style={{ ...cellBase(i === 0) }}>
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 9999, background: "rgba(0,0,0,0.04)", fontSize: 10.5, fontWeight: 500 }}>
                    {row.query}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
    return (
      <th style={{
        padding: "9px 12px",
        fontSize: 10, fontWeight: 600,
        letterSpacing: "0.02em", textTransform: "uppercase",
        color: HEAD, textAlign: align,
        borderBottom: `1px solid ${BORDER}`, background: "#fff",
      }}>
        {children}
      </th>
    );
  }

  function cellBase(first: boolean): React.CSSProperties {
    return {
      padding: "10px 12px",
      borderTop: first ? "none" : `1px solid ${BORDER}`,
      verticalAlign: "middle",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    };
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   SCENE 4 — Telegram + Discord notification stack (unchanged from prior)
   ════════════════════════════════════════════════════════════════════════════ */

function NotificationStack({ visible }: { visible: boolean }) {
  const [tgState, setTgState] = useState<"hidden" | "show" | "dismiss">("hidden");
  const [dcState, setDcState] = useState<"hidden" | "show" | "dismiss">("hidden");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!visible) return;
    function run() {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setTgState("hidden"); setDcState("hidden");
      timers.current.push(setTimeout(() => setTgState("show"),    400));
      timers.current.push(setTimeout(() => setTgState("dismiss"), 2800));
      timers.current.push(setTimeout(() => setDcState("show"),    3400));
      timers.current.push(setTimeout(() => setDcState("dismiss"), 5800));
      timers.current.push(setTimeout(run,                         7200));
    }
    run();
    return () => timers.current.forEach(clearTimeout);
  }, [visible]);

  function cardStyle(state: "hidden" | "show" | "dismiss"): React.CSSProperties {
    return {
      width: "100%",
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(20px) saturate(160%)",
      border: "1px solid rgba(0,0,0,0.07)",
      borderRadius: 18,
      padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 12,
      opacity: state === "show" ? 1 : 0,
      transform: state === "show"
        ? "translateY(0) scale(1)"
        : state === "dismiss"
        ? "translateY(-12px) scale(0.97)"
        : "translateY(-20px) scale(0.94)",
      transition: state === "show"
        ? `opacity 0.6s ${EASE_OUT}, transform 0.6s ${EASE_OUT}`
        : `opacity 0.45s ${EASE_IN_OUT}, transform 0.45s ${EASE_IN_OUT}`,
    };
  }
  const iconBase: React.CSSProperties = { flexShrink: 0, width: 38, height: 38, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" };
  const textClamp: React.CSSProperties = { fontSize: 13, color: "#1d1d1f", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" };

  return (
    <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={cardStyle(tgState)}>
        <div style={{ ...iconBase, background: "linear-gradient(135deg,#37aee2,#1e96c8)" }}>
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path fill="#fff" d="M9.417 15.181l-.397 5.584c.568 0 .814-.244 1.109-.537l2.663-2.545 5.518 4.041c1.012.564 1.725.267 1.998-.931L23.93 3.821l.001-.001c.321-1.496-.541-2.081-1.527-1.714L1.114 10.438c-1.466.564-1.444 1.375-.25 1.742l5.656 1.759 13.155-8.28c.618-.414 1.178-.185.713.226l-10.971 9.296z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.01em" }}>Telegram</span>
            <span style={{ fontSize: 12, color: "#6e6e73" }}>now</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 2, letterSpacing: "-0.01em" }}>AgentK Bot</div>
          <div style={textClamp}>🔥 New alert · 3 months in, still at 0 users. Is this normal for early SaaS?</div>
        </div>
      </div>
      <div style={cardStyle(dcState)}>
        <div style={{ ...iconBase, background: "#5865f2" }}>
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path fill="#fff" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.01em" }}>Discord</span>
            <span style={{ fontSize: 12, color: "#6e6e73" }}>now</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 2, letterSpacing: "-0.01em" }}>AgentK</div>
          <div style={textClamp}>🔥 New alert · Anyone using a CRM for cold outreach? What's working for B2B?</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Main section
   ════════════════════════════════════════════════════════════════════════════ */

export default function SocialProofFlow() {
  const [r1, v1] = useInView<HTMLDivElement>(0.25);
  const [r2, v2] = useInView<HTMLDivElement>(0.25);
  const [r3, v3] = useInView<HTMLDivElement>(0.25);
  const [r4, v4] = useInView<HTMLDivElement>(0.4);

  return (
    <section
      className="w-full max-w-6xl mx-auto px-6 py-40 flex flex-col gap-36"
      aria-label="How agentK works"
    >
      {/* Global keyframes for caret + click pulse */}
      <style>{`
        @keyframes agentk-caret { 50% { opacity: 0; } }
        @keyframes agentk-click {
          0%   { box-shadow: 0 0 0 0   rgba(223,132,157,0.55); transform: scale(1); }
          60%  { box-shadow: 0 0 0 14px rgba(223,132,157,0);    transform: scale(1.22); }
          100% { box-shadow: 0 0 0 14px rgba(223,132,157,0);    transform: scale(1); }
        }
      `}</style>

      <div className="text-center">
        <h2
          className="text-4xl md:text-5xl font-normal tracking-normal leading-none"
          style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}
        >
          how would it look like
        </h2>
      </div>

      {/* ── 1 · Normal mode ── */}
      <div className="flex flex-col md:flex-row items-center gap-14 md:gap-20" ref={r1}>
        <div className="w-full md:w-[38%] text-left space-y-4">
          <p className="text-2xl md:text-3xl font-bold text-on-surface leading-snug tracking-tight">
            Dial in your Reddit radar in seconds.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            Drop a handful of keywords, exclude the noise, and watch live posts surface straight into your feed. No configuration marathons.
          </p>
        </div>
        <div className="w-full md:w-[62%]">
          <NormalModeScene visible={v1} />
        </div>
      </div>

      {/* ── 2 · AI mode ── */}
      <div className="flex flex-col md:flex-row-reverse items-center gap-14 md:gap-20" ref={r2}>
        <div className="w-full md:w-[38%] space-y-4">
          <p className="text-2xl md:text-3xl font-bold text-on-surface leading-snug tracking-tight">
            Describe intent, not keywords.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            Write what you're actually hunting for in plain English. Our AI reads every new post and surfaces only the ones that match the spirit of your ask.
          </p>
        </div>
        <div className="w-full md:w-[62%]">
          <AiModeScene visible={v2} />
        </div>
      </div>

      {/* ── 3 · Conversion ── */}
      <div className="flex flex-col md:flex-row items-center gap-14 md:gap-20" ref={r3}>
        <div className="w-full md:w-[38%] text-left space-y-4">
          <p className="text-2xl md:text-3xl font-bold text-on-surface leading-snug tracking-tight">
            One click turns a post into a lead.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            Tap the bookmark and the post lands in a clean spreadsheet of prospects you can sort, filter, and export to CSV in a heartbeat.
          </p>
        </div>
        <div className="w-full md:w-[62%]">
          <ConversionScene visible={v3} />
        </div>
      </div>

      {/* ── 4 · Instant alerts ── */}
      <div className="flex flex-col md:flex-row-reverse items-center gap-14 md:gap-20" ref={r4}>
        <div className="w-full md:w-[38%] space-y-4">
          <p className="text-2xl md:text-3xl font-bold text-on-surface leading-snug tracking-tight">
            Instant alerts on Telegram and Discord.
          </p>
          <p className="text-sm text-secondary leading-relaxed">
            The moment a matching post goes live, AgentK fires an alert to whichever platform you use. No dashboard checking required.
          </p>
        </div>
        <div className="w-full md:w-[62%]">
          <div style={{
            width: "100%", height: 260, background: "#FDF7EF",
            borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)",
            overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 24px",
          }}>
            <NotificationStack visible={v4} />
          </div>
        </div>
      </div>
    </section>
  );
}

