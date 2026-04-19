import Image from "next/image";
import logo from "@/app/logo.png";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #edeff1", backgroundColor: "#FDF7EF" }}>
      <div className="w-full max-w-2xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-6">

        {/* Logo + name */}
        <a href="#" className="flex items-center gap-2">
          <Image src={logo} alt="AgentK" height={28} />
          <span
            className="text-lg font-extrabold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #ff9472 0%, #f2709c 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            agentK
          </span>
        </a>

        {/* Description */}
        <p className="text-sm leading-relaxed max-w-xs" style={{ color: "#B2A28C" }}>
          Monitors Reddit 24/7 and alerts you the moment your keywords appear.
        </p>

        {/* Links */}
        <div className="flex items-center gap-6">
          {[
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-xs transition-colors hover:text-on-surface"
              style={{ color: "#B2A28C" }}
            >
              {label}
            </a>
          ))}
        </div>

        {/* Copyright */}
        <p className="text-xs" style={{ color: "#C8C4BE" }}>
          © {new Date().getFullYear()} AgentK. All rights reserved.
        </p>

      </div>
    </footer>
  );
}
