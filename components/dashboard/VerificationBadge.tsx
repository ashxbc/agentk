"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";

interface Props {
  email?: string | null;
}

export default function VerificationBadge({ email }: Props) {
  const status = useQuery(api.emailVerification.getVerificationStatus);
  const [open, setOpen]   = useState(false);

  // Auto-close modal the moment verification comes through (reactive)
  useEffect(() => {
    if (status?.verified && open) setOpen(false);
  }, [status?.verified]);

  // Still loading or already verified — render nothing
  if (status === undefined || status === null || status.verified) return null;

  return (
    <>
      {/* Badge — fixed top-right */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", top: 14, right: 20, zIndex: 50,
          background: "none", border: "none", padding: 0,
          cursor: "pointer", fontSize: 12, fontWeight: 700,
          color: "#191918", letterSpacing: "-0.01em",
        }}
      >
        Not verified. Verify first.
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(25,25,24,0.3)", backdropFilter: "blur(4px)",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 20,
              padding: "44px 40px", maxWidth: 360, width: "90%",
              textAlign: "center",
              boxShadow: "0 8px 48px rgba(0,0,0,0.12)",
              border: "1px solid rgba(0,0,0,0.05)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 16, fontWeight: 800, color: "#191918", margin: "0 0 10px", letterSpacing: "-0.3px" }}>
              Check your email
            </p>
            <p style={{ fontSize: 13, color: "#62584F", lineHeight: 1.7, margin: "0 0 28px" }}>
              A verification link was sent to<br />
              <span style={{ fontWeight: 700, color: "#191918" }}>{email ?? "your email address"}</span>.
              <br />Click it to verify your account.
            </p>

            {/* Spinner — keeps spinning until verified, then modal auto-closes */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <svg
                style={{ animation: "spin .9s linear infinite" }}
                width="22" height="22" viewBox="0 0 24 24"
                fill="none" stroke="#DF849D" strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span style={{ fontSize: 11, color: "#B2A28C", fontWeight: 500 }}>
                Waiting for verification...
              </span>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
    </>
  );
}
