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
        <img
          src="/logo.png"
          alt="AgentK"
          style={{ width: 56, height: 56, borderRadius: 12, display: "block", margin: "0 auto 32px" }}
        />

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
          margin: 0,
        }}>
          We&apos;re rethinking things. A small pivot, a better product.
          <br />
          Back soon.
        </p>
      </div>
    </div>
  );
}
