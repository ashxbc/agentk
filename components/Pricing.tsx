"use client";

const FEATURES = [
  { label: "Keywords",           value: "50"        },
  { label: "Subreddits",         value: "5"         },
  { label: "Intent queries",     value: "3"         },
  { label: "Alerts",             value: "Unlimited" },
  { label: "Telegram + Discord", value: true        },
  { label: "Save leads to lists",value: true        },
  { label: "Alert cap control",  value: true        },
];

export default function Pricing() {
  return (
    <section className="w-full relative py-40 overflow-hidden" id="pricing" aria-label="AgentK Pricing" style={{ backgroundColor: "#FDF7EF" }}>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(223,132,157,0.07) 0%, transparent 70%)" }} />

      <div className="max-w-lg mx-auto px-6 relative z-10 text-center">

        <h2 className="text-4xl md:text-5xl font-normal tracking-normal mb-3 leading-none" style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}>
          pricing
        </h2>

        <div className="mb-12" />

        {/* Card */}
        <div style={{
          background: "#fff",
          borderRadius: "24px",
          border: "1px solid rgba(0,0,0,0.07)",
          overflow: "hidden",
          boxShadow: "none",
        }}>

          {/* Header */}
          <div style={{ padding: "32px 32px 28px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "4px", marginBottom: "8px" }}>
              <span style={{ fontSize: "72px", fontWeight: 900, letterSpacing: "-4px", color: "#191918", lineHeight: 1 }}>$0</span>
              <span style={{ fontSize: "18px", fontWeight: 600, color: "#B2A28C", marginBottom: "4px" }}>/forever</span>
            </div>
            <p style={{ fontSize: "14px", fontWeight: 500, color: "#62584F" }}>
              Everything included. Always free.
            </p>
          </div>

          {/* Feature rows */}
          <div style={{ padding: "8px 0" }}>
            {FEATURES.map(({ label, value }, i) => (
              <div key={label} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "13px 28px",
                borderBottom: i < FEATURES.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
              }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#62584F" }}>{label}</span>
                {value === true ? (
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #DF849D, #e8a0b4)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ) : (
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#DF849D" }}>{value}</span>
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ padding: "24px 28px 28px" }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("openAuthModal", { detail: { view: "signup-email" } }))}
              className="creative-gradient hover:scale-[1.02] active:scale-95 transition-transform"
              style={{
                display: "block", width: "100%", textAlign: "center",
                color: "#fff", fontWeight: 800, fontSize: "15px",
                padding: "14px", borderRadius: "14px",
                boxShadow: "0 4px 16px rgba(223,132,157,0.3)",
                border: "none", cursor: "pointer",
              }}
            >
              Start for Free
            </button>
            <p style={{ fontSize: "12px", color: "#B2A28C", marginTop: "10px", fontWeight: 500 }}>
              Takes 30 seconds to set up.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
