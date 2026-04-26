"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role   = "freelancer" | "marketer" | "builder";
type Phase  = "role" | "freelancer" | "marketer" | "builder" | "generating" | "review";

interface ProfileData {
  role?: Role;
  whatTheySell?: string; targetCustomer?: string; painSignals?: string; proof?: string;
  marketingSpecialty?: string; channels?: string; companyTypes?: string; companySize?: string;
  revenueRange?: string; growthProblem?: string; clientBottleneck?: string;
  metricsImproved?: string; bestResult?: string;
  productUrl?: string; productName?: string; productTagline?: string;
  productDescription?: string; productTags?: string[];
  revenueModel?: "free" | "freemium" | "paid";
  stage?: "idea" | "mvp" | "growth";
  userCount?: string; revenue?: string;
  icpRole?: string; icpPainPoints?: string; icpSwitchTrigger?: string;
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: "12px",
  border: "1.5px solid rgba(0,0,0,0.1)", fontSize: "15px",
  color: "#191918", background: "#FAFAF8", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: 500, color: "#B2A28C",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px",
};

const qStyle: React.CSSProperties = {
  fontSize: "22px", fontWeight: 700, color: "#191918",
  marginBottom: "24px", lineHeight: 1.3,
};

function Cta({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", padding: "16px", borderRadius: "12px", border: "none",
        background: disabled ? "rgba(223,132,157,0.3)" : "linear-gradient(135deg, #FF9A8B, #DF849D)",
        color: "#fff", fontSize: "16px", fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        marginTop: "24px", fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", color: "#B2A28C", fontSize: "14px",
        cursor: "pointer", padding: 0, fontFamily: "inherit", marginBottom: "28px", display: "block",
      }}
    >
      ← Back
    </button>
  );
}

function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: "flex", gap: "6px", marginBottom: "28px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? "20px" : "6px", height: "6px",
          borderRadius: "9999px",
          background: i <= current ? "#DF849D" : "rgba(0,0,0,0.1)",
          transition: "all 0.2s ease",
        }} />
      ))}
    </div>
  );
}

function PillSelect({ options, value, onChange, multi = false }: {
  options: string[]; value: string | string[];
  onChange: (v: string | string[]) => void; multi?: boolean;
}) {
  const sel = multi ? (value as string[]) : [value as string];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
      {options.map((opt) => {
        const on = sel.includes(opt);
        return (
          <button key={opt} onClick={() => {
            if (multi) {
              const arr = value as string[];
              onChange(on ? arr.filter((v) => v !== opt) : [...arr, opt]);
            } else { onChange(opt); }
          }} style={{
            padding: "10px 20px", borderRadius: "9999px",
            border: `1.5px solid ${on ? "#DF849D" : "rgba(0,0,0,0.1)"}`,
            background: on ? "rgba(223,132,157,0.08)" : "transparent",
            color: on ? "#DF849D" : "#3D3A36", fontSize: "14px", fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

// ── Step definitions ──────────────────────────────────────────────────────────

const FL_STEPS = [
  { label: "What you offer",   q: "What do you sell or offer?",          key: "whatTheySell",   ph: "e.g. brand design, copywriting, dev work" },
  { label: "Ideal client",     q: "Who's your ideal client?",            key: "targetCustomer", ph: "e.g. early-stage SaaS founders" },
  { label: "Pain signals",     q: "What pain are they feeling?",         key: "painSignals",    ph: "e.g. struggling with visual identity" },
  { label: "Your proof",       q: "Any results or proof? (optional)",    key: "proof",          ph: "e.g. helped 3 startups reach $1M ARR", optional: true },
];

const MK_STEPS = [
  { label: "Specialty",        q: "What type of marketing do you specialize in?", key: "marketingSpecialty", ph: "e.g. SEO, paid ads, content" },
  { label: "Channels",         q: "What channels do you focus on?",               key: "channels",           ph: "e.g. Twitter, newsletters, LinkedIn" },
  { label: "Company type",     q: "What kind of companies do you work with?",     key: "companyTypes",       type: "pillMulti", options: ["SaaS", "Ecom", "Local", "Agency", "Other"] },
  { label: "Company size",     q: "What size companies?",                          key: "companySize",        type: "pill",      options: ["Solo", "Startup", "Mid-size", "Enterprise"] },
  { label: "Revenue range",    q: "What's their revenue range? (optional)",       key: "revenueRange",       ph: "e.g. $0–50k MRR", optional: true },
  { label: "Growth problem",   q: "What growth problem do you solve best?",       key: "growthProblem",      ph: "e.g. scaling content without budget" },
  { label: "Client bottleneck",q: "What's the #1 bottleneck your clients face?", key: "clientBottleneck",   ph: "e.g. not enough qualified leads" },
  { label: "Metrics",          q: "What metrics do you improve?",                 key: "metricsImproved",    ph: "e.g. traffic, CAC, conversion rate" },
];

// ── Builder product fetch step ─────────────────────────────────────────────────

function BuilderUrlStep({ profile, onUpdate, onNext, onBack }: {
  profile: ProfileData;
  onUpdate: (k: string, v: any) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const fetchProductInfo = useAction(api.fetchProductUrl.fetchProductInfo);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function handleFetch() {
    const url = profile.productUrl ?? "";
    if (!url) return;
    setLoading(true);
    try {
      const info = await fetchProductInfo({ url });
      if (info.name)        onUpdate("productName",        info.name);
      if (info.tagline)     onUpdate("productTagline",     info.tagline);
      if (info.description) onUpdate("productDescription", info.description);
      if (info.tags?.length) onUpdate("productTags",       info.tags);
      setFetched(true);
    } catch {
      setFetched(true); // allow manual fill
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <BackBtn onClick={onBack} />
      <Dots total={6} current={0} />
      <p style={labelStyle}>Product URL</p>
      <p style={qStyle}>Drop your product URL</p>
      <div style={{ display: "flex", gap: "10px" }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={profile.productUrl ?? ""}
          placeholder="https://yourproduct.com"
          onChange={(e) => { onUpdate("productUrl", e.target.value); setFetched(false); }}
        />
        <button
          onClick={handleFetch}
          disabled={loading || !profile.productUrl}
          style={{
            padding: "0 20px", borderRadius: "12px", border: "1.5px solid rgba(0,0,0,0.1)",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            fontSize: "14px", color: "#3D3A36",
          }}
        >
          {loading ? "…" : "Fetch"}
        </button>
      </div>
      {fetched && (
        <Cta label="Continue →" onClick={onNext} disabled={!profile.productUrl} />
      )}
    </div>
  );
}

function BuilderPreviewStep({ profile, onUpdate, onNext, onBack }: {
  profile: ProfileData; onUpdate: (k: string, v: any) => void;
  onNext: () => void; onBack: () => void;
}) {
  return (
    <div>
      <BackBtn onClick={onBack} />
      <Dots total={6} current={1} />
      <p style={labelStyle}>Product preview</p>
      <p style={qStyle}>Here's what we found — look right?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { label: "Name",        key: "productName",        ph: "Product name" },
          { label: "Tagline",     key: "productTagline",     ph: "One-line tagline" },
          { label: "Description", key: "productDescription", ph: "60-word description" },
        ].map(({ label, key, ph }) => (
          <div key={key}>
            <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#B2A28C", fontWeight: 500 }}>{label}</p>
            <input
              style={inputStyle}
              value={(profile as any)[key] ?? ""}
              placeholder={ph}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#B2A28C", fontWeight: 500 }}>Revenue model</p>
          <PillSelect
            options={["Free", "Freemium", "Paid"]}
            value={profile.revenueModel ?? ""}
            onChange={(v) => onUpdate("revenueModel", (v as string).toLowerCase())}
          />
        </div>
      </div>
      <Cta label="Looks good →" onClick={onNext} />
    </div>
  );
}

// ── Review screen ─────────────────────────────────────────────────────────────

function ReviewScreen({ subs, queries, onChangeSubs, onChangeQueries, onLaunch, launching }: {
  subs: string[]; queries: string[];
  onChangeSubs: (s: string[]) => void;
  onChangeQueries: (q: string[]) => void;
  onLaunch: () => void; launching: boolean;
}) {
  const [newSub, setNewSub] = useState("");

  return (
    <div>
      <p style={{ fontSize: "22px", fontWeight: 700, color: "#191918", marginBottom: "28px" }}>
        Here's your setup
      </p>

      {/* Subreddits */}
      <div style={{ marginBottom: "24px" }}>
        <p style={{ ...labelStyle, marginBottom: "12px" }}>Subreddits ({subs.length}/10)</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
          {subs.map((s, i) => (
            <span key={s} style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              padding: "5px 10px 5px 12px", borderRadius: "9999px",
              background: "#FDF7EF", border: "1px solid rgba(0,0,0,0.08)",
              fontSize: "13px", fontWeight: 500, color: "#3D3A36",
            }}>
              r/{s}
              <button onClick={() => onChangeSubs(subs.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#B2A28C",
                  padding: "0 0 0 2px", fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        {subs.length < 10 && (
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              style={{ ...inputStyle, fontSize: "13px", padding: "10px 12px" }}
              value={newSub}
              placeholder="Add subreddit…"
              onChange={(e) => setNewSub(e.target.value.replace(/^r\//i, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSub.trim()) {
                  onChangeSubs([...subs, newSub.trim()]);
                  setNewSub("");
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Queries */}
      <div style={{ marginBottom: "8px" }}>
        <p style={{ ...labelStyle, marginBottom: "12px" }}>Search queries (5)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {queries.map((q, i) => (
            <div key={i} style={{ position: "relative" }}>
              <input
                style={{ ...inputStyle, fontSize: "13px", padding: "10px 48px 10px 12px" }}
                value={q}
                maxLength={80}
                onChange={(e) => {
                  const next = [...queries];
                  next[i] = e.target.value;
                  onChangeQueries(next);
                }}
              />
              <span style={{
                position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                fontSize: "11px", color: "#B2A28C",
              }}>{q.length}/80</span>
            </div>
          ))}
        </div>
      </div>

      <Cta label={launching ? "Launching…" : "Launch AgentK →"} onClick={onLaunch} disabled={launching || subs.length === 0 || queries.length === 0} />
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase]           = useState<Phase>("role");
  const [stepIdx, setStepIdx]       = useState(0);
  const [profile, setProfile]       = useState<ProfileData>({});
  const [genSubs, setGenSubs]       = useState<string[]>([]);
  const [genQueries, setGenQueries] = useState<string[]>([]);
  const [genError, setGenError]     = useState<string | null>(null);
  const [launching, setLaunching]   = useState(false);

  const saveProfile        = useMutation(api.userProfile.saveProfile);
  const saveQueries        = useMutation(api.userQueries.saveQueries);
  const completeOnboarding = useMutation(api.userProfile.completeOnboarding);
  const generateSetup      = useAction(api.generateSetup.generateSetup);

  function upd(k: string, v: any) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  function handleRoleSelect(role: Role) {
    setProfile({ role });
    setPhase(role);
    setStepIdx(0);
  }

  const steps = phase === "freelancer" ? FL_STEPS : phase === "marketer" ? MK_STEPS : [];
  const totalSteps = phase === "builder" ? 6 : steps.length;

  async function handleFinish() {
    // Save profile to DB
    await saveProfile(profile as any);
    setPhase("generating");
    setGenError(null);
    try {
      const { subreddits, queries } = await generateSetup({});
      setGenSubs(subreddits);
      setGenQueries(queries);
      setPhase("review");
    } catch (err) {
      setGenError(String(err));
    }
  }

  async function handleLaunch() {
    setLaunching(true);
    try {
      await saveQueries({ subreddits: genSubs, queries: genQueries });
      await completeOnboarding({});
      onComplete();
    } catch {
      setLaunching(false);
    }
  }

  function handleNext() {
    if (stepIdx < steps.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      handleFinish();
    }
  }

  function handleBack() {
    if (stepIdx === 0) {
      setPhase("role");
      setStepIdx(0);
    } else {
      setStepIdx((i) => i - 1);
    }
  }

  const currentStep = steps[stepIdx];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "min(560px, calc(100vw - 40px))", background: "#ffffff",
        borderRadius: "20px", padding: "48px", boxSizing: "border-box",
        maxHeight: "90vh", overflowY: "auto",
      }}>

        {/* Role selection */}
        {phase === "role" && (
          <div>
            <p style={{ fontSize: "13px", fontWeight: 500, color: "#B2A28C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Welcome</p>
            <p style={{ fontSize: "26px", fontWeight: 700, color: "#191918", marginBottom: "32px", lineHeight: 1.2 }}>
              Who are you?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {(["Freelancer", "Marketer", "Builder"] as const).map((r) => (
                <button key={r} onClick={() => handleRoleSelect(r.toLowerCase() as Role)} style={{
                  width: "100%", padding: "20px 24px", borderRadius: "14px", textAlign: "left",
                  border: "1.5px solid rgba(0,0,0,0.1)", background: "transparent",
                  fontSize: "16px", fontWeight: 600, color: "#191918", cursor: "pointer",
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#DF849D"; (e.currentTarget as HTMLElement).style.background = "rgba(223,132,157,0.04)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Freelancer + Marketer steps */}
        {(phase === "freelancer" || phase === "marketer") && currentStep && (
          <div>
            <BackBtn onClick={handleBack} />
            <Dots total={totalSteps} current={stepIdx} />
            <p style={labelStyle}>{currentStep.label}</p>
            <p style={qStyle}>{currentStep.q}</p>

            {(currentStep as any).type === "pill" ? (
              <PillSelect
                options={(currentStep as any).options}
                value={(profile as any)[currentStep.key] ?? ""}
                onChange={(v) => upd(currentStep.key, v)}
              />
            ) : (currentStep as any).type === "pillMulti" ? (
              <PillSelect
                multi
                options={(currentStep as any).options}
                value={(profile as any)[currentStep.key] ? ((profile as any)[currentStep.key] as string).split(",").map((s: string) => s.trim()) : []}
                onChange={(v) => upd(currentStep.key, (v as string[]).join(", "))}
              />
            ) : (
              <input
                style={inputStyle}
                value={(profile as any)[currentStep.key] ?? ""}
                placeholder={(currentStep as any).ph}
                onChange={(e) => upd(currentStep.key, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleNext(); }}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Cta
                label={stepIdx === steps.length - 1 ? "Generate my setup →" : "Continue →"}
                onClick={handleNext}
                disabled={(currentStep as any).optional ? false : !(profile as any)[currentStep.key]}
              />
              {(currentStep as any).optional && (
                <button onClick={handleNext} style={{
                  background: "none", border: "none", color: "#B2A28C", fontSize: "14px",
                  cursor: "pointer", padding: "8px 0", fontFamily: "inherit",
                }}>
                  Skip
                </button>
              )}
            </div>
          </div>
        )}

        {/* Builder steps */}
        {phase === "builder" && stepIdx === 0 && (
          <BuilderUrlStep profile={profile} onUpdate={upd} onBack={handleBack}
            onNext={() => setStepIdx(1)} />
        )}
        {phase === "builder" && stepIdx === 1 && (
          <BuilderPreviewStep profile={profile} onUpdate={upd} onBack={() => setStepIdx(0)}
            onNext={() => setStepIdx(2)} />
        )}
        {phase === "builder" && stepIdx === 2 && (
          <div>
            <BackBtn onClick={() => setStepIdx(1)} />
            <Dots total={6} current={2} />
            <p style={labelStyle}>Stage</p>
            <p style={qStyle}>Where are you right now?</p>
            <PillSelect
              options={["Idea", "MVP", "Growth"]}
              value={profile.stage ? profile.stage.charAt(0).toUpperCase() + profile.stage.slice(1) : ""}
              onChange={(v) => upd("stage", (v as string).toLowerCase())}
            />
            <Cta label="Continue →" onClick={() => setStepIdx(3)} disabled={!profile.stage} />
          </div>
        )}
        {phase === "builder" && stepIdx === 3 && (
          <div>
            <BackBtn onClick={() => setStepIdx(2)} />
            <Dots total={6} current={3} />
            <p style={labelStyle}>Traction</p>
            <p style={qStyle}>How many users? Any revenue?</p>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#B2A28C", fontWeight: 500 }}>Users</p>
                <input style={inputStyle} value={profile.userCount ?? ""} placeholder="e.g. 0, ~200, 1k+"
                  onChange={(e) => upd("userCount", e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#B2A28C", fontWeight: 500 }}>Revenue</p>
                <input style={inputStyle} value={profile.revenue ?? ""} placeholder="e.g. $0, $2k MRR"
                  onChange={(e) => upd("revenue", e.target.value)} />
              </div>
            </div>
            <Cta label="Continue →" onClick={() => setStepIdx(4)} />
          </div>
        )}
        {phase === "builder" && stepIdx === 4 && (
          <div>
            <BackBtn onClick={() => setStepIdx(3)} />
            <Dots total={6} current={4} />
            <p style={labelStyle}>Ideal user</p>
            <p style={qStyle}>Who benefits most from your product?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input style={inputStyle} value={profile.icpRole ?? ""} placeholder="Role (e.g. founder, designer)"
                onChange={(e) => upd("icpRole", e.target.value)} />
              <input style={inputStyle} value={profile.icpPainPoints ?? ""} placeholder="Pain points (e.g. can't afford a dev)"
                onChange={(e) => upd("icpPainPoints", e.target.value)} />
              <input style={inputStyle} value={profile.icpSwitchTrigger ?? ""} placeholder="What triggers them to switch? (e.g. just got funding)"
                onChange={(e) => upd("icpSwitchTrigger", e.target.value)} />
            </div>
            <Cta label="Generate my setup →" onClick={handleFinish} />
          </div>
        )}

        {/* Generating screen */}
        {phase === "generating" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "linear-gradient(135deg, #FF9A8B, #DF849D)",
              margin: "0 auto 24px",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
            <p style={{ fontSize: "18px", fontWeight: 600, color: "#191918", marginBottom: "8px" }}>
              Finding your best subreddits…
            </p>
            <p style={{ fontSize: "14px", color: "#B2A28C" }}>Analyzing your profile</p>
            {genError && (
              <div style={{ marginTop: "24px" }}>
                <p style={{ color: "#E04444", fontSize: "14px" }}>Something went wrong. <button onClick={handleFinish} style={{ color: "#DF849D", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Try again</button></p>
              </div>
            )}
            <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(.95)} }`}</style>
          </div>
        )}

        {/* Review screen */}
        {phase === "review" && (
          <ReviewScreen
            subs={genSubs}
            queries={genQueries}
            onChangeSubs={setGenSubs}
            onChangeQueries={setGenQueries}
            onLaunch={handleLaunch}
            launching={launching}
          />
        )}
      </div>
    </div>
  );
}
