"use client";

import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";

// Invisible component mounted on the landing page.
// Handles Google signup redirect: after OAuth lands on "/", detects the
// googleSignupPending flag and pushes the user to /dashboard once auth settles.
export default function GoogleLoginChecker() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [signupPending, setSignupPending] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("googleSignupPending") === "1") {
      sessionStorage.removeItem("googleSignupPending");
      setSignupPending(true);
    }
  }, []);

  useEffect(() => {
    if (!signupPending || isLoading) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [signupPending, isLoading, isAuthenticated]);

  return null;
}
