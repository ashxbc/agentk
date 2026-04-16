"use client";

export default function Pricing() {
  return (
    <section className="w-full relative py-40 overflow-hidden" id="pricing" aria-label="AgentK Pricing" style={{ backgroundColor: "#FDF7EF" }}>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(223,132,157,0.08) 0%, transparent 70%)" }} />

      <div className="max-w-3xl mx-auto px-6 relative z-10 text-center">

        <h2 className="text-4xl md:text-5xl font-normal tracking-normal mb-6 leading-none" style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}>
          pricing
        </h2>

        <div className="mt-16 mb-8">
          <span className="text-8xl md:text-9xl font-extrabold tracking-tighter" style={{ color: "#191918" }}>$0</span>
        </div>

        <p className="text-2xl md:text-3xl font-bold tracking-tight mb-4" style={{ color: "#191918" }}>
          No plans. No tiers. No limits.
        </p>

        <p className="text-lg font-medium leading-relaxed mb-16 max-w-xl mx-auto" style={{ color: "#62584F" }}>
          Unlimited keywords. Unlimited subreddits. Instant Telegram alerts.
          AgentK is completely free — no card, no trial, no catch.
        </p>

        <a
          href="/dashboard"
          className="creative-gradient text-white px-12 py-5 rounded-xl text-lg font-black shadow-lg shadow-pink-100 hover:scale-[1.02] transition-transform active:scale-95 inline-block"
        >
          Start for Free
        </a>

        <p className="mt-8 text-sm font-medium" style={{ color: "#B2A28C" }}>
          Takes 30 seconds to set up.
        </p>

      </div>
    </section>
  );
}
