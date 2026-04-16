import Image from "next/image";
import logo from "@/app/logo.png";


export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ borderTop: "1px solid #edeff1" }}>

      {/* Main footer body */}
      <div className="w-full max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row justify-between gap-12 md:gap-8">

          {/* Brand */}
          <div className="md:max-w-xs">
            <a href="#" className="flex items-center gap-2 mb-4">
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
            <p className="text-sm leading-relaxed mb-6" style={{ color: "#5f5e5e" }}>
              An AI growth agent that finds people already searching for your solution — and helps you reply before anyone else does.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-row gap-16 md:gap-20">

            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase mb-4" style={{ color: "#c0bfbf" }}>Product</p>
              <ul className="space-y-3">
                {[
                  { label: "Pricing", href: "#pricing" },
                  { label: "FAQ", href: "#faq" },
                  { label: "Chrome Extension", href: "#" },
                  { label: "Changelog", href: "#" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-sm transition-colors duration-200 hover:text-on-surface"
                      style={{ color: "#5f5e5e" }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase mb-4" style={{ color: "#c0bfbf" }}>Company</p>
              <ul className="space-y-3">
                {[
                  { label: "About", href: "#" },
                  { label: "Blog", href: "#" },
                  { label: "Privacy Policy", href: "#" },
                  { label: "Terms of Service", href: "#" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-sm transition-colors duration-200 hover:text-on-surface"
                      style={{ color: "#5f5e5e" }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: "1px solid #edeff1" }}>
        <div className="w-full max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "#b0b0b0" }}>
            © {year} AgentK. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: "#c8c8c8" }}>
            Built for founders who'd rather reply than run ads.
          </p>
        </div>
      </div>

    </footer>
  );
}
