"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token");
  const verifyToken  = useMutation(api.emailVerification.verifyEmailToken);

  const [status, setStatus] = useState<"loading" | "success" | "invalid" | "expired">("loading");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    verifyToken({ token })
      .then((result) => {
        if (result?.success) {
          setStatus("success");
          setTimeout(() => router.replace("/dashboard"), 2200);
        } else {
          setStatus(result?.reason === "expired" ? "expired" : "invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#FDF7EF", fontFamily: "Inter,-apple-system,BlinkMacSystemFont,sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "44px 40px",
        maxWidth: 380, width: "90%", textAlign: "center",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#DF849D", marginBottom: 28, letterSpacing: "-0.5px" }}>
          agentK
        </div>

        {status === "loading" && (
          <>
            <svg style={{ animation: "spin .8s linear infinite", marginBottom: 20 }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DF849D" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#191918", margin: 0 }}>Verifying...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "linear-gradient(135deg,#ff9472,#f2709c)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#191918", margin: "0 0 8px" }}>Email verified</p>
            <p style={{ fontSize: 13, color: "#62584F", margin: 0 }}>Taking you to your dashboard...</p>
          </>
        )}

        {status === "expired" && (
          <>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#191918", margin: "0 0 8px" }}>Link expired</p>
            <p style={{ fontSize: 13, color: "#62584F", margin: "0 0 24px" }}>
              Verification links expire after 24 hours. Sign in to your dashboard to request a new one.
            </p>
            <a href="/dashboard" style={{
              display: "inline-block", background: "linear-gradient(135deg,#ff9472,#f2709c)",
              color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 22px",
              borderRadius: 10, textDecoration: "none",
            }}>Go to dashboard</a>
          </>
        )}

        {status === "invalid" && (
          <>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#191918", margin: "0 0 8px" }}>Invalid link</p>
            <p style={{ fontSize: 13, color: "#62584F", margin: "0 0 24px" }}>
              This verification link is not valid. Try signing in again or contact support.
            </p>
            <a href="/" style={{
              display: "inline-block", background: "linear-gradient(135deg,#ff9472,#f2709c)",
              color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 22px",
              borderRadius: 10, textDecoration: "none",
            }}>Go home</a>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FDF7EF" }}>
        <svg style={{ animation: "spin .8s linear infinite" }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DF849D" strokeWidth="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
