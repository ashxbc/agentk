"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

type View = "login" | "signup-email" | "signup-username" | "signup-password";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export default function AuthModal({ isOpen, onClose }: Props) {
  const { signIn } = useAuthActions();

  const [view, setView]         = useState<View>("login");
  const [email, setEmail]       = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // When the modal opens, check if the dashboard left an auth error in sessionStorage.
  useEffect(() => {
    if (!isOpen) return;
    const pending = sessionStorage.getItem("authError");
    if (pending) {
      setError(pending);
      sessionStorage.removeItem("authError");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function reset() {
    setView("login");
    setEmail("");
    setUsername("");
    setPassword("");
    setError("");
    setShowPw(false);
    setGoogleLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleGoogle(intent: "login" | "signup") {
    if (googleLoading) return;
    setError("");
    setGoogleLoading(true);
    sessionStorage.setItem("googleAuthIntent", intent);
    try { await signIn("google", { redirectTo: "/dashboard" }); }
    catch (err: any) {
      sessionStorage.removeItem("googleAuthIntent");
      setError(err?.message ?? "Google sign-in failed.");
      setGoogleLoading(false);
    }
  }

  async function handleLogin() {
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      fd.set("flow", "signIn");
      await signIn("password", fd);
      window.location.href = "/dashboard";
      handleClose();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no account")) {
        setError("Account does not exist. Please use the correct credentials or sign up.");
      } else {
        setError(msg || "Invalid credentials.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSignupEmailNext() {
    setError("");
    if (!email || !email.includes("@")) { setError("Enter a valid email."); return; }
    setView("signup-username");
  }

  function handleSignupUsernameNext() {
    setError("");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError("Username must be 3–20 chars: letters, numbers, underscore.");
      return;
    }
    setView("signup-password");
  }

  async function handleSignupSubmit() {
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      fd.set("name", username);
      fd.set("flow", "signUp");
      await signIn("password", fd);
      window.location.href = "/dashboard";
      handleClose();
    } catch (err: any) {
      setError(err?.message ?? "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  const EyeIcon = ({ show }: { show: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {show ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </>
      )}
    </svg>
  );

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-[#191918] placeholder:text-[#B2A28C] outline-none focus:border-[#DF849D] transition-colors bg-white";
  const gradBtn  = "mt-4 w-full py-2.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50";
  const backBtn  = "flex items-center gap-1 text-xs text-[#B2A28C] font-medium hover:text-[#191918] transition-colors mb-5";
  const GRAD     = { background: "linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)" };
  const BackArrow = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className={backBtn}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      Back
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[400px] bg-white rounded-2xl border border-black/[0.08] p-8 mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* ── LOGIN ── */}
        {view === "login" && (
          <>
            <h2 className="text-xl font-extrabold tracking-tight text-[#191918] mb-1">Welcome back</h2>
            <p className="text-sm text-[#B2A28C] font-medium mb-6">Sign in to your AgentK account</p>

            <button onClick={() => handleGoogle("login")} disabled={googleLoading} className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm font-semibold text-[#191918] hover:bg-[#fafafa] transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
              {GOOGLE_ICON} {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-black/[0.08]" />
              <span className="text-xs text-[#B2A28C] font-medium">or</span>
              <div className="flex-1 h-px bg-black/[0.08]" />
            </div>

            <div className="space-y-3">
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} className={inputCls} />
              <div className="relative">
                <input type={showPw ? "text" : "password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} className={inputCls + " pr-11"} />
                <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#B2A28C] hover:text-[#191918] transition-colors">
                  <EyeIcon show={showPw} />
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}

            <button onClick={handleLogin} disabled={loading} className={gradBtn} style={GRAD}>
              {loading ? "Signing in…" : "Login"}
            </button>

            <p className="text-center text-xs text-[#B2A28C] font-medium mt-5">
              New here?{" "}
              <button onClick={() => { setError(""); setView("signup-email"); }} className="text-[#DF849D] font-bold hover:underline">
                Sign up →
              </button>
            </p>
          </>
        )}

        {/* ── SIGNUP STEP 1: EMAIL ── */}
        {view === "signup-email" && (
          <>
            <h2 className="text-xl font-extrabold tracking-tight text-[#191918] mb-1">Create account</h2>
            <p className="text-sm text-[#B2A28C] font-medium mb-6">Step 1 of 3 — your email</p>

            <button onClick={() => handleGoogle("signup")} disabled={googleLoading} className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm font-semibold text-[#191918] hover:bg-[#fafafa] transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
              {GOOGLE_ICON} {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-black/[0.08]" />
              <span className="text-xs text-[#B2A28C] font-medium">or</span>
              <div className="flex-1 h-px bg-black/[0.08]" />
            </div>

            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignupEmailNext()} className={inputCls} autoFocus />
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
            <button onClick={handleSignupEmailNext} className={gradBtn} style={GRAD}>Next →</button>

            <p className="text-center text-xs text-[#B2A28C] font-medium mt-5">
              Already have an account?{" "}
              <button onClick={() => { setError(""); setView("login"); }} className="text-[#DF849D] font-bold hover:underline">Log in</button>
            </p>
          </>
        )}

        {/* ── SIGNUP STEP 2: USERNAME ── */}
        {view === "signup-username" && (
          <>
            <BackArrow onClick={() => { setError(""); setView("signup-email"); }} />
            <h2 className="text-xl font-extrabold tracking-tight text-[#191918] mb-1">Pick a username</h2>
            <p className="text-sm text-[#B2A28C] font-medium mb-6">Step 2 of 3 — 3–20 chars, letters, numbers, underscore</p>
            <input type="text" placeholder="username" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignupUsernameNext()} className={inputCls} autoFocus />
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
            <button onClick={handleSignupUsernameNext} className={gradBtn} style={GRAD}>Next →</button>
          </>
        )}

        {/* ── SIGNUP STEP 3: PASSWORD ── */}
        {view === "signup-password" && (
          <>
            <BackArrow onClick={() => { setError(""); setView("signup-username"); }} />
            <h2 className="text-xl font-extrabold tracking-tight text-[#191918] mb-1">Set a password</h2>
            <p className="text-sm text-[#B2A28C] font-medium mb-6">Step 3 of 3 — minimum 8 characters</p>
            <div className="relative">
              <input type={showPw ? "text" : "password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignupSubmit()} className={inputCls + " pr-11"} autoFocus />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#B2A28C] hover:text-[#191918] transition-colors">
                <EyeIcon show={showPw} />
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
            <button onClick={handleSignupSubmit} disabled={loading} className={gradBtn} style={GRAD}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
