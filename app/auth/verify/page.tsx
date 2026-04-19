"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";

export default function AuthVerifyPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [nowTs] = useState(() => Date.now());
  const deleteAccount = useMutation(api.users.deleteAccount);

  const isNewGoogleUser = useQuery(
    api.users.isNewGoogleUser,
    isAuthenticated ? { now: nowTs } : "skip",
  );

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/");
      return;
    }

    if (isNewGoogleUser === undefined) return;

    if (isNewGoogleUser) {
      deleteAccount()
        .catch(() => {})
        .finally(() => {
          sessionStorage.setItem(
            "authError",
            "No account found for this Google account. Please sign up first.",
          );
          signOut().then(() => router.replace("/?openLogin=true"));
        });
    } else {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, isNewGoogleUser]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100vw", height: "100vh", background: "#FDF7EF" }}>
      <svg style={{ animation: "spin .6s linear infinite" }} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#DF849D" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
