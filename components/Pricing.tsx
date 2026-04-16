"use client";

import { useState } from "react";
import { useConvexAuth } from "convex/react";
import AuthModal from "@/components/AuthModal";

type Billing = "monthly" | "yearly";

/* ── Icons ──────────────────────────────────────────────────── */

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none">
    <path d="M4.5 8l2.5 2.5 4.5-5" stroke="#DF849D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DimIcon = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none">
    <path d="M5.5 8h5" stroke="#E0E0E0" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ── Data ───────────────────────────────────────────────────── */

const FREE_FEATURES  = ["2 tracked keywords", "Reddit monitoring", "10 AI replies / month", "Basic intent feed"];
const FREE_EXCLUDED  = ["X (Twitter) monitoring", "On-page X assist", "Advanced filters", "Priority feed refresh"];
const PRO_FEATURES   = ["10 tracked keywords", "Reddit + X monitoring", "100 AI replies / month", "On-page X assist", "Advanced filters", "Priority feed refresh"];
const ULTRA_FEATURES = ["Everything in Pro", "Unlimited keywords", "Unlimited AI replies", "Multi-account support", "Early access to new features", "Priority support"];

/* ── Billing toggle ─────────────────────────────────────────── */

function BillingToggle({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }) {
  const yearly = value === "yearly";
  return (
    <div className="flex items-center justify-center gap-4 mt-12">
      <span className="text-sm font-semibold transition-colors duration-200" style={{ color: yearly ? "#B2A28C" : "#191918" }}>
        Monthly
      </span>
      <button
        role="switch"
        aria-checked={yearly}
        aria-label="Toggle billing period"
        onClick={() => onChange(yearly ? "monthly" : "yearly")}
        className="relative w-12 h-6 rounded-full focus:outline-none transition-all duration-300"
        style={{ background: yearly ? "#DF849D" : "#E5E1DB" }}
      >
        <span
          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300"
          style={{ transform: yearly ? "translateX(24px)" : "translateX(0)" }}
        />
      </button>
      <span className="text-sm font-semibold transition-colors duration-200" style={{ color: yearly ? "#191918" : "#B2A28C" }}>
        Yearly
      </span>
      <span
        className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider transition-all duration-300"
        style={{
          background: "#FF9A8B",
          color: "#462D28",
          opacity: yearly ? 1 : 0.5,
          transform: yearly ? "scale(1)" : "scale(0.9)",
        }}
      >
        Save 25%
      </span>
    </div>
  );
}

/* ── Price block ────────────────────────────────────────────── */

function PriceBlock({ monthly, yearly, billing, subtitle }: { monthly: number; yearly: number; billing: Billing; subtitle: string }) {
  const isYearly = billing === "yearly";
  const price    = isYearly ? yearly : monthly;
  const dimColor = "#62584F";
  const mainColor = "#191918";

  if (monthly === 0) {
    return (
      <div className="mb-8">
        <div className="flex items-end gap-1.5 leading-none">
          <span className="text-5xl font-extrabold tracking-tight" style={{ color: mainColor }}>$0</span>
          <span className="text-base font-semibold pb-1.5 ml-0.5" style={{ color: dimColor }}>/mo</span>
        </div>
        <p className="text-xs mt-3 font-medium" style={{ color: dimColor }}>{subtitle}</p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex items-end gap-1.5 leading-none">
        <span className="text-5xl font-extrabold tracking-tight" style={{ color: mainColor }}>${price}</span>
        <span className="text-base font-semibold pb-1.5 ml-0.5" style={{ color: dimColor }}>/mo</span>
      </div>
      <p className="text-xs mt-3 font-medium" style={{ color: dimColor }}>
        {isYearly
          ? `Billed yearly at $${price * 12}/year`
          : "Billed monthly, cancel anytime"}
      </p>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────── */

export default function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [authOpen, setAuthOpen] = useState(false);
  const [loading,  setLoading]  = useState<string | null>(null);
  const { isAuthenticated }     = useConvexAuth();

  async function handleCheckout(plan: "pro" | "ultra") {
    if (!isAuthenticated) {
      setAuthOpen(true);
      return;
    }
    const key = `${plan}_${billing}` as const;
    setLoading(key);
    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan:       key,
          successUrl: `${window.location.origin}/billing?success=1`,
          cancelUrl:  `${window.location.origin}/#pricing`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        alert("Something went wrong. Please try again.");
      }
    } catch (err) {
      console.error("Checkout fetch error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="w-full relative py-40 overflow-hidden" id="pricing" aria-label="AgentK Pricing" style={{ backgroundColor: "#FDF7EF" }}>

      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#DF849D] opacity-[0.03] blur-[120px] rounded-full -mr-48 -mt-48 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#FF9A8B] opacity-[0.03] blur-[120px] rounded-full -ml-48 -mb-48 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-normal tracking-normal mb-8 leading-none" style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}>
            pricing
          </h2>
          <BillingToggle value={billing} onChange={setBilling} />
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">

          {/* ── Free ── */}
          <div
            className="rounded-[2rem] flex flex-col p-10 border transition-all duration-500"
            style={{ background: "#ffffff", borderColor: "rgba(0,0,0,0.04)" }}
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: "#191918" }}>Free</h3>
              <p className="text-sm font-medium leading-relaxed" style={{ color: "#62584F" }}>
                Get started and find your first buying-intent posts — no credit card needed.
              </p>
            </div>

            <PriceBlock monthly={0} yearly={0} billing={billing} subtitle="Always free, no card required" />

            <ul className="space-y-4 mb-10 flex-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm font-medium" style={{ color: "#3D3A36" }}>
                  <CheckIcon />{f}
                </li>
              ))}
              {FREE_EXCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm font-medium opacity-40" style={{ color: "#B2A28C" }}>
                  <DimIcon />{f}
                </li>
              ))}
            </ul>

            <div>
              <button className="w-full py-4 rounded-xl text-sm font-bold border transition-all duration-300 bg-white text-[#191918] border-[#191918] hover:bg-[#F2F2F2] active:scale-[0.98]">
                Get Started Free
              </button>
            </div>
          </div>

          {/* ── Pro ── */}
          <div
            className="rounded-[2.5rem] flex flex-col p-10 relative border-2"
            style={{ background: "#ffffff", borderColor: "#DF849D" }}
          >
            {/* Badge */}
            <div className="absolute -top-[14px] left-1/2 -translate-x-1/2">
              <span
                className="text-[10px] font-black px-5 py-2 rounded-full text-white uppercase tracking-widest"
                style={{ background: "linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)" }}
              >
                Most Popular
              </span>
            </div>

            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: "#191918" }}>Pro</h3>
              <p className="text-sm font-medium leading-relaxed" style={{ color: "#62584F" }}>
                For founders actively growing — more keywords, X coverage, and higher reply volume.
              </p>
            </div>

            <PriceBlock monthly={19} yearly={14} billing={billing} subtitle="" />

            <ul className="space-y-4 mb-10 flex-1">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm font-bold" style={{ color: "#191918" }}>
                  <CheckIcon />{f}
                </li>
              ))}
            </ul>

            <div>
              <button
                onClick={() => handleCheckout("pro")}
                disabled={loading === `pro_${billing}`}
                className="w-full py-4 rounded-xl text-sm font-black shadow-lg shadow-pink-100 transition-all duration-300 active:scale-[0.98] hover:scale-[1.02] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)", color: "#ffffff" }}
              >
                {loading === `pro_${billing}` ? "Redirecting…" : "Go Pro"}
              </button>
            </div>
          </div>

          {/* ── Ultra ── */}
          <div
            className="rounded-[2rem] flex flex-col p-10 border transition-all duration-500"
            style={{ background: "#ffffff", borderColor: "rgba(0,0,0,0.04)" }}
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: "#191918" }}>Ultra</h3>
              <p className="text-sm font-medium leading-relaxed" style={{ color: "#62584F" }}>
                No limits. For power users who want to dominate every relevant conversation.
              </p>
            </div>

            <PriceBlock monthly={49} yearly={37} billing={billing} subtitle="" />

            <ul className="space-y-4 mb-10 flex-1">
              {ULTRA_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm font-medium" style={{ color: "#3D3A36" }}>
                  <CheckIcon />{f}
                </li>
              ))}
            </ul>

            <div>
              <button
                onClick={() => handleCheckout("ultra")}
                disabled={loading === `ultra_${billing}`}
                className="w-full py-4 rounded-xl text-sm font-bold border transition-all duration-300 bg-white text-[#191918] border-[#191918] hover:bg-[#F2F2F2] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading === `ultra_${billing}` ? "Redirecting…" : "Go Ultra"}
              </button>
            </div>
          </div>

        </div>

        {/* Trust strip */}
        <p className="text-center text-xs mt-14" style={{ color: "#B2A28C" }}>
          All plans include SSL encryption · No ads, ever · Cancel anytime
        </p>
      </div>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </section>
  );
}
