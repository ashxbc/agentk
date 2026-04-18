"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "agentk_tour_v1";
const CARD_W = 264;

interface TourStep {
  target: string | null;
  placement: "center" | "left";
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    target: null,
    placement: "center",
    title: "Your feed",
    body: "Posts matching your keywords appear here. AgentK checks Reddit every 5 minutes.",
  },
  {
    target: "toolbar",
    placement: "left",
    title: "Track keywords",
    body: "Tap the toolbar to add the keywords you want to monitor — up to 50 at a time.",
  },
  {
    target: "toolbar",
    placement: "left",
    title: "Pick subreddits",
    body: "Choose which subreddits to watch. The more focused, the less noise.",
  },
  {
    target: "toolbar",
    placement: "left",
    title: "Filter the noise",
    body: "Set minimum upvotes, comments, or karma to surface only quality posts.",
  },
  {
    target: null,
    placement: "center",
    title: "Get alerted",
    body: "Head to Settings to connect Telegram or Discord. You'll get an instant alert the moment a match is found.",
  },
];

export default function ProductTour() {
  const [step, setStep]       = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos]         = useState<{ top: number; left: number } | null>(null);
  const [opacity, setOpacity] = useState(1);
  const cardRef               = useRef<HTMLDivElement>(null);

  // Only show for first-time users
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  // Position card next to target element
  useEffect(() => {
    if (!visible) return;
    const current = STEPS[step];
    if (current.placement === "center" || !current.target) {
      setPos(null);
      return;
    }

    const compute = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (!el) { setPos(null); return; }
      const rect   = el.getBoundingClientRect();
      const cardH  = cardRef.current?.offsetHeight ?? 175;
      setPos({
        left: rect.left - CARD_W - 16,
        top:  Math.max(8, Math.min(
          rect.top + rect.height / 2 - cardH / 2,
          window.innerHeight - cardH - 8
        )),
      });
    };

    const t = setTimeout(compute, 30);
    window.addEventListener("resize", compute);
    return () => { clearTimeout(t); window.removeEventListener("resize", compute); };
  }, [step, visible]);

  // Highlight ring on target element
  useEffect(() => {
    if (!visible) return;
    const current = STEPS[step];
    if (!current.target) return;
    const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
    if (!el) return;
    const prev = el.style.boxShadow;
    el.style.transition = "box-shadow 0.25s ease";
    el.style.boxShadow  = "0 0 0 2.5px rgba(223, 132, 157, 0.5)";
    return () => { el.style.boxShadow = prev; };
  }, [step, visible]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const goNext = () => {
    if (step >= STEPS.length - 1) { dismiss(); return; }
    setOpacity(0);
    setTimeout(() => {
      setStep(s => s + 1);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpacity(1)));
    }, 150);
  };

  if (!visible) return null;

  const current  = STEPS[step];
  const isCenter = current.placement === "center" || !pos;
  const isLast   = step === STEPS.length - 1;

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        ...(isCenter
          ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
          : { left: pos!.left, top: pos!.top }),
        width: CARD_W,
        background: "#fff",
        borderRadius: "14px",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "20px 22px 18px",
        zIndex: 1000,
        opacity,
        transition: "opacity 0.15s ease",
      }}
    >
      {/* Right-pointing arrow for left-placed steps */}
      {!isCenter && (
        <div
          style={{
            position: "absolute",
            right: "-5px",
            top: "50%",
            transform: "translateY(-50%) rotate(45deg)",
            width: "10px",
            height: "10px",
            background: "#fff",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            borderRight: "1px solid rgba(0,0,0,0.08)",
          }}
        />
      )}

      {/* Progress dots — active dot stretches into a pill */}
      <div style={{ display: "flex", gap: "5px", marginBottom: "14px" }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width:      i === step ? "18px" : "6px",
              height:     "6px",
              borderRadius: "3px",
              background: i === step ? "#DF849D" : "rgba(0,0,0,0.09)",
              transition: "width 0.25s ease, background 0.25s ease",
            }}
          />
        ))}
      </div>

      {/* Title */}
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#191918", margin: "0 0 6px", lineHeight: 1.3 }}>
        {current.title}
      </p>

      {/* Body */}
      <p style={{ fontSize: "12.5px", color: "#62584F", lineHeight: 1.6, margin: 0 }}>
        {current.body}
      </p>

      {/* Skip / Next */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "18px" }}>
        <button
          onClick={dismiss}
          style={{
            background: "none", border: "none", padding: 0,
            cursor: "pointer", fontSize: "12px", color: "#B2A28C",
            fontWeight: 500, fontFamily: "inherit",
          }}
        >
          Skip
        </button>
        <button
          onClick={goNext}
          style={{
            background: "linear-gradient(135deg, #ff9472 0%, #f2709c 100%)",
            border: "none", borderRadius: "8px", padding: "7px 14px",
            cursor: "pointer", fontSize: "12px", color: "#fff",
            fontWeight: 600, fontFamily: "inherit", letterSpacing: "0.01em",
          }}
        >
          {isLast ? "Done" : "Next →"}
        </button>
      </div>
    </div>
  );
}
