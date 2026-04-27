import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgentK",
  alternates: { canonical: "https://tryagentk.com" },
};

export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#FDF7EF",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      fontFamily: "Inter, -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        {/* Wordmark */}
        <p style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#B2A28C",
          marginBottom: 32,
        }}>
          AgentK
        </p>

        {/* Main message */}
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 56px)",
          fontWeight: 800,
          color: "#191918",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          margin: "0 0 24px",
        }}>
          Something new<br />
          <span style={{ color: "#DF849D" }}>is coming.</span>
        </h1>

        <p style={{
          fontSize: 16,
          color: "#6B6358",
          lineHeight: 1.65,
          margin: "0 0 48px",
        }}>
          We&apos;re rethinking things — a small pivot, a better product.
          <br />
          Back soon.
        </p>

        {/* Divider */}
        <div style={{
          width: 40,
          height: 1,
          background: "#E8DDD3",
          margin: "0 auto 48px",
        }} />

        {/* Dashboard link for existing users */}
        <a
          href="/dashboard"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#B2A28C",
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Existing user? Go to dashboard →
        </a>
      </div>
    </div>
  );
}
