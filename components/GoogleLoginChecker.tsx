"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";

// Invisible component — renders nothing.
// Handles two post-Google-OAuth flows on the landing page:
//
// googleLoginPending: user tried to log in via Google. If no existing account,
//   deletes the auto-created one, signs out, reloads with modal + error.
//   If account exists, goes to dashboard.
//
// googleSignupPending: user signed up via Google. Once authenticated,
//   redirects straight to dashboard. Bypasses relying on OAuth redirectTo
//   which breaks when CONVEX_SITE_URL differs from the current domain.
export default function GoogleLoginChecker() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [loginPending, setLoginPending] = useState(false);
  const [signupPending, setSignupPending] = useState(false);
  const [nowTs] = useState(() => Date.now());
  const deleteAccount = useMutation(api.users.deleteAccount);

  useEffect(() => {
    if (sessionStorage.getItem("googleLoginPending") === "1") {
      sessionStorage.removeItem("googleLoginPending");
      setLoginPending(true);
    }
    if (sessionStorage.getItem("googleSignupPending") === "1") {
      sessionStorage.removeItem("googleSignupPending");
      setSignupPending(true);
    }
  }, []);

  const isNewGoogleUser = useQuery(
    api.users.isNewGoogleUser,
    loginPending && isAuthenticated ? { now: nowTs } : "skip",
  );

  // Handle login check
  useEffect(() => {
    if (!loginPending || isLoading || !isAuthenticated || isNewGoogleUser === undefined) return;

    if (isNewGoogleUser) {
      deleteAccount()
        .catch(() => {})
        .finally(() => {
          sessionStorage.setItem(
            "authError",
            "No account found for this Google account. Please sign up first.",
          );
          signOut().then(() => {
            window.location.href = "/?openLogin=true";
          });
        });
    } else {
      router.replace("/dashboard");
    }
  }, [loginPending, isLoading, isAuthenticated, isNewGoogleUser]);

  // Handle signup — once auth resolves, go to dashboard
  useEffect(() => {
    if (!signupPending || isLoading) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [signupPending, isLoading, isAuthenticated]);

  return null;
}
