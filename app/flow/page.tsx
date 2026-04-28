"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  cream:   "#FDF7EF",
  dark:    "#191918",
  pink:    "#DF849D",
  muted:   "#B2A28C",
  subtle:  "#6B6358",
  body:    "#3D3A36",
  border:  "rgba(0,0,0,0.09)",
  white:   "#fff",
  surface: "rgba(255,255,255,0.7)",
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_BRAND = {
  tagline:     "Find and engage leads on Reddit before anyone else.",
  description: "AgentK scans Reddit 24/7 and detects posts where people are actively looking for what you sell. It alerts you in minutes so you can reply first, start real conversations, and convert prospects before competitors see the thread.",
  problems:    ["Missing buyer-intent posts in real time", "Slow manual Reddit monitoring", "Losing leads to faster competitors"],
  useCases:    ["B2B SaaS lead generation", "Freelancer client acquisition", "Founder community outreach"],
};

const MOCK_POST = {
  subreddit: "r/startups",
  title:     "How do you find early customers without spending on ads?",
  author:    "u/the_early_stage",
};

const MOCK_REPLY = `Honestly the highest-ROI thing early on is showing up in communities where your buyers already hang out and being genuinely useful — not pitching, just answering. Reddit is underrated for this. If you know which subreddits your people use, you can find threads where they're already describing the pain your product solves and be the first to reply with something real. That first-mover position compounds.`;

const REJECTION_TAGS = [
  "Too long",
  "Too salesy",
  "Wrong tone",
  "Doesn't sound like me",
  "Missed the point",
  "Would never say this",
];

// ─── Shared style helpers ─────────────────────────────────────────────────────

function inputCss(focused: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px 18px",
    fontSize: 16,
    fontFamily: "inherit",
    color: C.dark,
    background: C.white,
    border: `1.5px solid ${focused ? C.pink : C.border}`,
    borderRadius: 10,
    outline: "none",
    transition: "border-color 0.18s",
    lineHeight: 1.55,
    boxSizing: "border-box" as const,
  };
}

function textareaCss(focused: boolean): React.CSSProperties {
  return { ...inputCss(focused), resize: "vertical" as const, minHeight: 100 };
}

const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 30px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg,#ff9472 0%,#f2709c 100%)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.01em",
  transition: "opacity 0.15s, transform 0.12s",
};

const btnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "13px 24px",
  borderRadius: 10,
  border: `1.5px solid ${C.border}`,
  background: "transparent",
  color: C.subtle,
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "border-color 0.18s, color 0.18s",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg style={{ animation: "agentk-spin 0.8s linear infinite" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.pink} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
      <div style={{ height: 3, background: "rgba(0,0,0,0.06)" }}>
        <div style={{
          height: "100%",
          width: `${(step / total) * 100}%`,
          background: C.pink,
          transition: "width 0.55s cubic-bezier(0.22,1,0.36,1)",
        }} />
      </div>
    </div>
  );
}

// ─── Step shell ───────────────────────────────────────────────────────────────

function Shell({
  step, total, heading, sub, children, onBack, onContinue,
  ctaLabel = "Continue", ctaDisabled = false, hideActions = false,
}: {
  step: number; total: number; heading: string; sub?: string;
  children?: React.ReactNode; onBack?: () => void; onContinue?: () => void;
  ctaLabel?: string; ctaDisabled?: boolean; hideActions?: boolean;
}) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: C.cream,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px 24px 60px",
      fontFamily: "Inter, -apple-system, sans-serif",
      animation: "agentk-stepIn 0.42s cubic-bezier(0.22,1,0.36,1) both",
    }}>
      <div style={{ width: "100%", maxWidth: 580 }}>
        {/* Counter */}
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 32 }}>
          {step} / {total}
        </p>

        {/* Heading */}
        <h1 style={{ fontSize: "clamp(26px,5vw,38px)", fontWeight: 800, color: C.dark, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
          {heading}
        </h1>
        {sub && (
          <p style={{ fontSize: 16, color: C.subtle, lineHeight: 1.65, margin: "0 0 36px", maxWidth: 480 }}>
            {sub}
          </p>
        )}

        {/* Content slot */}
        {children}

        {/* Actions */}
        {!hideActions && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 36, flexWrap: "wrap" }}>
            {onContinue && (
              <button
                style={{ ...btnPrimary, opacity: ctaDisabled ? 0.4 : 1 }}
                disabled={ctaDisabled}
                onClick={onContinue}
                onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
                onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
              >
                {ctaLabel} <ArrowRight />
              </button>
            )}
            {onBack && (
              <button style={btnGhost} onClick={onBack}>
                <ArrowLeft /> Back
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 1 — Product URL ─────────────────────────────────────────────────────

function Step1({ onNext }: { onNext: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <Shell
      step={1} total={6}
      heading="What's your product URL?"
      sub="Paste it and we'll pull your brand info automatically."
      onContinue={url.trim() ? () => onNext(url.trim()) : undefined}
      ctaDisabled={!url.trim()}
    >
      <input
        autoFocus
        type="url"
        placeholder="https://yourproduct.com"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => { if (e.key === "Enter" && url.trim()) onNext(url.trim()); }}
        style={inputCss(focused)}
      />
    </Shell>
  );
}

// ─── Step 2 — Brand auto-fill ─────────────────────────────────────────────────

type Stage = "pre-launch" | "launched" | "growing" | "established";

function FocusInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [f, setF] = useState(false);
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{ ...inputCss(f), fontSize: 14 }}
    />
  );
}

function FocusTextarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const [f, setF] = useState(false);
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{ ...textareaCss(f), fontSize: 14 }}
    />
  );
}

function SkeletonLine({ width = "100%", height = 14 }: { width?: string; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 6, background: "rgba(0,0,0,0.06)",
      animation: "agentk-shimmer 1.4s ease-in-out infinite",
      backgroundImage: "linear-gradient(90deg,rgba(0,0,0,0.06) 0%,rgba(0,0,0,0.1) 50%,rgba(0,0,0,0.06) 100%)",
      backgroundSize: "200% 100%",
    }} />
  );
}

function Step2({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [tagline, setTagline] = useState("");
  const [desc, setDesc]       = useState("");
  const [problems, setProblems] = useState(["", "", ""]);
  const [useCases, setUseCases] = useState(["", "", ""]);
  const [stage, setStage]     = useState<Stage>("launched");

  useEffect(() => {
    const t = setTimeout(() => {
      setTagline(MOCK_BRAND.tagline);
      setDesc(MOCK_BRAND.description);
      setProblems([...MOCK_BRAND.problems]);
      setUseCases([...MOCK_BRAND.useCases]);
      setLoading(false);
    }, 1600);
    return () => clearTimeout(t);
  }, []);

  const STAGES: Stage[] = ["pre-launch", "launched", "growing", "established"];

  const label = (s: string) => (
    <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase", margin: "0 0 6px" }}>
      {s}
    </p>
  );

  if (loading) {
    return (
      <Shell step={2} total={6} heading="Pulling your brand info…" hideActions>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Spinner />
            <span style={{ fontSize: 14, color: C.muted }}>Reading your site…</span>
          </div>
          {[1, 0.7, 0.5, 0.85, 0.6].map((w, i) => (
            <SkeletonLine key={i} width={`${w * 100}%`} height={i === 0 ? 20 : 14} />
          ))}
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      step={2} total={6}
      heading="Does this look right?"
      sub="We pulled this from your site. Edit anything that's off."
      onBack={onBack}
      onContinue={onNext}
      ctaLabel="Looks good, continue"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Tagline */}
        <div>
          {label("Tagline")}
          <FocusInput value={tagline} onChange={setTagline} placeholder="Your one-liner" />
        </div>

        {/* Description */}
        <div>
          {label("Description (40–45 words)")}
          <FocusTextarea value={desc} onChange={setDesc} rows={4} />
        </div>

        {/* Problems */}
        <div>
          {label("Top 3 problems you solve")}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {problems.map((p, i) => (
              <FocusInput key={i} value={p} onChange={v => setProblems(prev => prev.map((x, j) => j === i ? v : x))} placeholder={`Problem ${i + 1}`} />
            ))}
          </div>
        </div>

        {/* Use cases */}
        <div>
          {label("Top 3 use cases")}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {useCases.map((u, i) => (
              <FocusInput key={i} value={u} onChange={v => setUseCases(prev => prev.map((x, j) => j === i ? v : x))} placeholder={`Use case ${i + 1}`} />
            ))}
          </div>
        </div>

        {/* Stage */}
        <div>
          {label("Where are you right now?")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STAGES.map(s => (
              <button
                key={s}
                onClick={() => setStage(s)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 999,
                  border: `1.5px solid ${stage === s ? C.pink : C.border}`,
                  background: stage === s ? `${C.pink}18` : "transparent",
                  color: stage === s ? C.pink : C.subtle,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "all 0.18s",
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ─── Step 3 — Connect accounts ────────────────────────────────────────────────

function PlatformCard({
  name, icon, connected, analyzing, onConnect,
}: {
  name: string; icon: React.ReactNode; connected: boolean; analyzing: boolean; onConnect: () => void;
}) {
  return (
    <button
      onClick={!connected ? onConnect : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "20px 24px",
        borderRadius: 14,
        border: `1.5px solid ${connected ? C.pink : C.border}`,
        background: connected ? `${C.pink}0d` : C.white,
        cursor: connected ? "default" : "pointer",
        width: "100%",
        transition: "all 0.2s",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: connected ? C.pink : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.dark, margin: 0, lineHeight: 1 }}>{name}</p>
        <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0", lineHeight: 1 }}>
          {connected ? (analyzing ? "Analyzing your writing…" : "Connected") : "Click to connect"}
        </p>
      </div>
      {connected && !analyzing && (
        <div style={{ color: C.pink, flexShrink: 0 }}><Check /></div>
      )}
      {connected && analyzing && (
        <div style={{ flexShrink: 0 }}><Spinner /></div>
      )}
    </button>
  );
}

function XIcon({ white }: { white?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={white ? "#fff" : C.body}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
    </svg>
  );
}

function RedditIcon({ white }: { white?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={white ? "#fff" : C.body}>
      <path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.22.22 0 00-.26.16l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.55zM8 11a1 1 0 111 1 1 1 0 01-1-1zm5.37 2.71a3.39 3.39 0 01-2.37.63 3.39 3.39 0 01-2.37-.63.22.22 0 01.31-.31 2.93 2.93 0 002.06.47 2.93 2.93 0 002.06-.47.22.22 0 01.31.31zM13 12a1 1 0 111-1 1 1 0 01-1 1z"/>
    </svg>
  );
}

function Step3({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [xConn, setXConn]         = useState(false);
  const [redditConn, setReddit]   = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed]   = useState(false);

  const connect = (set: (v: boolean) => void) => {
    set(true);
    setAnalyzing(true);
    setTimeout(() => { setAnalyzing(false); setAnalyzed(true); }, 2400);
  };

  return (
    <Shell
      step={3} total={6}
      heading="Connect your accounts."
      sub="We'll quietly read your recent posts to learn how you write. Nothing is posted."
      onBack={onBack}
      onContinue={analyzed ? onNext : undefined}
      ctaDisabled={!analyzed}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PlatformCard
          name="X (Twitter)"
          icon={<XIcon white={xConn} />}
          connected={xConn}
          analyzing={xConn && analyzing}
          onConnect={() => connect(setXConn)}
        />
        <PlatformCard
          name="Reddit"
          icon={<RedditIcon white={redditConn} />}
          connected={redditConn}
          analyzing={redditConn && analyzing}
          onConnect={() => connect(setReddit)}
        />

        {analyzed && (
          <div style={{
            marginTop: 8,
            padding: "16px 20px",
            borderRadius: 12,
            background: `${C.pink}12`,
            border: `1px solid ${C.pink}30`,
            animation: "agentk-stepIn 0.4s ease both",
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.pink, margin: 0 }}>
              We&apos;ve learned how you write. You&apos;re set.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ─── Step 4 — Guardrails ──────────────────────────────────────────────────────

function LabeledInput({
  label, value, onChange, placeholder, multi,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multi?: boolean;
}) {
  const [f, setF] = useState(false);
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, color: C.subtle, margin: "0 0 8px" }}>{label}</p>
      {multi ? (
        <textarea
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setF(true)}
          onBlur={() => setF(false)}
          style={{ ...textareaCss(f), fontSize: 15 }}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setF(true)}
          onBlur={() => setF(false)}
          style={{ ...inputCss(f), fontSize: 15 }}
        />
      )}
    </div>
  );
}

function Step4({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [avoid,   setAvoid]   = useState("");
  const [banned,  setBanned]  = useState("");
  const [mention, setMention] = useState("");
  const [stance,  setStance]  = useState("");

  return (
    <Shell
      step={4} total={6}
      heading="Set your guardrails."
      sub="Tell the agent what to stay away from. You can change this any time."
      onBack={onBack}
      onContinue={onNext}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <LabeledInput
          label="Topics the agent should never touch"
          value={avoid}
          onChange={setAvoid}
          placeholder="e.g. politics, competitors by name, pricing disputes"
          multi
        />
        <LabeledInput
          label="Banned words or phrases"
          value={banned}
          onChange={setBanned}
          placeholder="e.g. game-changer, disruptive, synergy"
        />
        <LabeledInput
          label="How should your product be mentioned?"
          value={mention}
          onChange={setMention}
          placeholder="e.g. only when directly relevant, always include a link, mention naturally without pushing"
        />
        <LabeledInput
          label="Default stance"
          value={stance}
          onChange={setStance}
          placeholder="e.g. helpful peer, skeptical outsider, knowledgeable expert"
        />
      </div>
    </Shell>
  );
}

// ─── Step 5 — Calibration ─────────────────────────────────────────────────────

function Step5({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [postUrl,     setPostUrl]     = useState("");
  const [urlFocused,  setUrlFocused]  = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [replyShown,  setReplyShown]  = useState(false);
  const [approved,    setApproved]    = useState(false);
  const [rejected,    setRejected]    = useState(false);
  const [feedbackTxt, setFeedbackTxt] = useState("");
  const [tags,        setTags]        = useState<string[]>([]);
  const [fbFocused,   setFbFocused]   = useState(false);
  const [iteration,   setIteration]   = useState(0);

  const generate = () => {
    setGenerating(true);
    setReplyShown(false);
    setRejected(false);
    setFeedbackTxt("");
    setTags([]);
    setTimeout(() => { setGenerating(false); setReplyShown(true); setIteration(n => n + 1); }, 1800);
  };

  const toggleTag = (t: string) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <Shell
      step={5} total={6}
      heading="Let's calibrate your voice."
      sub="Paste any post URL from X or Reddit. The agent will generate one reply for you to review."
      onBack={onBack}
      onContinue={approved ? onNext : undefined}
      ctaDisabled={!approved}
      ctaLabel="Perfect, continue"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* URL input + generate */}
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="url"
            placeholder="https://reddit.com/r/startups/comments/…"
            value={postUrl}
            onChange={e => setPostUrl(e.target.value)}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            onKeyDown={e => { if (e.key === "Enter" && postUrl.trim() && !generating) generate(); }}
            style={{ ...inputCss(urlFocused), flex: 1 }}
          />
          <button
            style={{
              ...btnPrimary,
              opacity: (!postUrl.trim() || generating) ? 0.45 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            disabled={!postUrl.trim() || generating}
            onClick={generate}
          >
            {generating ? "Generating…" : replyShown ? "Regenerate" : "Generate reply"}
          </button>
        </div>

        {/* Generating state */}
        {generating && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0" }}>
            <Spinner />
            <span style={{ fontSize: 14, color: C.muted }}>Reading the post and drafting a reply…</span>
          </div>
        )}

        {/* Reply shown */}
        {replyShown && !generating && (
          <div style={{ animation: "agentk-stepIn 0.4s ease both" }}>
            {/* Mock post context */}
            <div style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.03)",
              border: `1px solid ${C.border}`,
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, margin: "0 0 4px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {MOCK_POST.subreddit} · {MOCK_POST.author}
              </p>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.dark, margin: 0 }}>{MOCK_POST.title}</p>
            </div>

            {/* Generated reply */}
            <div style={{
              padding: "20px",
              borderRadius: 12,
              background: C.white,
              border: `1.5px solid ${C.border}`,
              marginBottom: 20,
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.pink, margin: "0 0 10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Draft reply {iteration > 1 ? `(iteration ${iteration})` : ""}
              </p>
              <p style={{ fontSize: 15, color: C.body, lineHeight: 1.7, margin: 0 }}>{MOCK_REPLY}</p>
            </div>

            {/* Approve / reject */}
            {!approved && !rejected && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  style={{ ...btnPrimary }}
                  onClick={() => setApproved(true)}
                  onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
                  onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                >
                  <Check /> This nails it
                </button>
                <button
                  style={btnGhost}
                  onClick={() => setRejected(true)}
                >
                  Not quite right
                </button>
              </div>
            )}

            {/* Approved */}
            {approved && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "14px 18px", borderRadius: 10,
                background: `${C.pink}12`, border: `1px solid ${C.pink}30`,
              }}>
                <div style={{ color: C.pink }}><Check /></div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.pink, margin: 0 }}>Voice calibrated. Ready to continue.</p>
              </div>
            )}

            {/* Rejected feedback */}
            {rejected && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "agentk-stepIn 0.35s ease both" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.subtle, margin: 0 }}>What was off?</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {REJECTION_TAGS.map(t => (
                    <button
                      key={t}
                      onClick={() => toggleTag(t)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 999,
                        border: `1.5px solid ${tags.includes(t) ? C.pink : C.border}`,
                        background: tags.includes(t) ? `${C.pink}18` : "transparent",
                        color: tags.includes(t) ? C.pink : C.subtle,
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  placeholder="Anything else? (optional)"
                  value={feedbackTxt}
                  onChange={e => setFeedbackTxt(e.target.value)}
                  onFocus={() => setFbFocused(true)}
                  onBlur={() => setFbFocused(false)}
                  style={{ ...textareaCss(fbFocused), fontSize: 14 }}
                />
                <button
                  style={{ ...btnPrimary, alignSelf: "flex-start" }}
                  onClick={generate}
                  onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
                  onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                >
                  Regenerate
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

// ─── Step 6 — All set ─────────────────────────────────────────────────────────

function Step6() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "100dvh",
      background: C.cream,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px 24px 60px",
      fontFamily: "Inter, -apple-system, sans-serif",
      animation: "agentk-stepIn 0.5s cubic-bezier(0.22,1,0.36,1) both",
      textAlign: "center",
    }}>
      {/* Check mark */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: `${C.pink}18`,
        border: `2px solid ${C.pink}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 32,
        color: C.pink,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.pink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>

      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 16 }}>
        6 / 6
      </p>

      <h1 style={{ fontSize: "clamp(30px,5vw,44px)", fontWeight: 800, color: C.dark, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 16px" }}>
        Your agent is ready.
      </h1>

      <p style={{ fontSize: 16, color: C.subtle, lineHeight: 1.65, maxWidth: 400, margin: "0 0 12px" }}>
        Everything you just set up is editable in Settings whenever you want to adjust.
      </p>

      <p style={{ fontSize: 14, color: C.muted, margin: "0 0 40px" }}>
        The agent starts working as soon as you hit the dashboard.
      </p>

      <button
        style={{ ...btnPrimary, fontSize: 16, padding: "16px 40px" }}
        onClick={() => router.push("/dashboard")}
        onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
        onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
      >
        Go to dashboard <ArrowRight />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FlowPage() {
  const [step, setStep] = useState(1);
  const [animKey, setAnimKey] = useState(0);

  const go = (n: number) => {
    setAnimKey(k => k + 1);
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const next = () => go(step + 1);
  const back = () => go(step - 1);

  return (
    <>
      <style>{`
        @keyframes agentk-stepIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes agentk-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes agentk-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        * { box-sizing: border-box; }
        input, textarea { font-family: Inter, -apple-system, sans-serif !important; }
        button { font-family: Inter, -apple-system, sans-serif !important; }
      `}</style>

      <ProgressBar step={step} total={6} />

      <div key={animKey}>
        {step === 1 && <Step1 onNext={next} />}
        {step === 2 && <Step2 onNext={next} onBack={back} />}
        {step === 3 && <Step3 onNext={next} onBack={back} />}
        {step === 4 && <Step4 onNext={next} onBack={back} />}
        {step === 5 && <Step5 onNext={next} onBack={back} />}
        {step === 6 && <Step6 />}
      </div>
    </>
  );
}
