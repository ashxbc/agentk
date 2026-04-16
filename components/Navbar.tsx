"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import logo from "@/app/logo.png";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import AuthModal from "@/components/AuthModal";

export default function Navbar() {
  const [authOpen, setAuthOpen]       = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { isAuthenticated }           = useConvexAuth();
  const { signOut }                   = useAuthActions();
  const user    = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");
  const billing = useQuery(api.billing.getUserPlan, isAuthenticated ? {} : "skip");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const email   = user?.email ?? "";
  const initial = email.charAt(0).toUpperCase();
  const plan    = billing?.plan ?? "free";

  // Auto-open auth modal when ?openLogin=true is in the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openLogin") === "true") {
      setAuthOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen]);

  return (
    <header className="w-full max-w-4xl mx-auto px-4 pt-4 relative" style={{ zIndex: 100 }}>
      <nav className="bg-surface/80 backdrop-blur-xl border border-outline-variant/30 rounded-full px-8 py-3 flex justify-between items-center">
        {/* Brand Logo */}
        <a href="#" className="flex items-center gap-2 shrink-0">
          <Image src={logo} alt="AgentK" height={32} priority />
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ background: "linear-gradient(135deg, #ff9472 0%, #f2709c 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
          >
            agentK
          </span>
        </a>

        {/* Centered Navigation Links */}
        <div className="hidden md:flex items-center gap-10 absolute left-1/2 -translate-x-1/2">
          <a href="#pricing" className="tracking-tight font-medium text-sm text-secondary hover:text-primary transition-colors duration-300">Pricing</a>
          <a href="#faq" className="tracking-tight font-medium text-sm text-secondary hover:text-primary transition-colors duration-300">FAQ</a>
        </div>

        {/* Trailing Primary Action */}
        <div className="flex items-center gap-4 shrink-0">
          {isAuthenticated ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold select-none focus:outline-none"
                style={{ backgroundColor: "#DF849D" }}
              >
                {initial || "?"}
              </button>

              {dropdownOpen && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-4 w-48 rounded-xl border overflow-hidden"
                  style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)", zIndex: 9999 }}
                >
                  {/* Account info */}
                  <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                    <p className="text-[12px] font-semibold text-[#191918] truncate">{email}</p>
                    <p className="text-[11px] mt-0.5 capitalize" style={{ color: "#B2A28C" }}>{plan} plan</p>
                  </div>

                  {/* Dashboard */}
                  <a
                    href="/dashboard"
                    className="block px-4 py-2.5 text-[12px] font-medium text-[#62584F] hover:bg-[#FDF7EF] transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Dashboard
                  </a>

                  {/* Logout */}
                  <button
                    onClick={() => { setDropdownOpen(false); signOut(); }}
                    className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#62584F] hover:bg-[#FDF7EF] transition-colors"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="bg-on-surface text-surface px-6 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-all active:scale-95 duration-200 ease-in-out"
            >
              Login
            </button>
          )}
        </div>
      </nav>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
