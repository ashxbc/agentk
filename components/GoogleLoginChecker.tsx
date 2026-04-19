"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";

// Invisible component — renders nothing.
// When a Google login attempt lands on the home page, silently checks whether
// the Google account has an existing AgentK account. If not, deletes the
// auto-created account, signs out, and reloads the landing page with the
// sign-in modal open and an error message. If yes, redirects to the dashboard.
export default function GoogleLoginChecker() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [nowTs] = useState(() => Date.now());
  const deleteAccount = useMutation(api.users.deleteAccount);

  useEffect(() => {
    if (sessionStorage.getItem("googleLoginPending") === "1") {
      sessionStorage.removeItem("googleLoginPending");
      setPending(true);
    }
  }, []);

  const isNewGoogleUser = useQuery(
    api.users.isNewGoogleUser,
    pending && isAuthenticated ? { now: nowTs } : "skip",
  );

  useEffect(() => {
    if (!pending || isLoading || !isAuthenticated || isNewGoogleUser === undefined) return;

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
  }, [pending, isLoading, isAuthenticated, isNewGoogleUser]);

  return null;
}
