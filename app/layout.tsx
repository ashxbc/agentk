import type { Metadata } from "next";
import { Inter, Roboto_Slab, Dancing_Script } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-roboto-slab",
});

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-cursive",
});

export const metadata: Metadata = {
  title: "AgentK",
  description: "Agentk is an AI growth agent that monitors conversations across Reddit and X, detects buying intent, and helps you craft natural, context-aware replies to convert those moments into real users consistently.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body
        className={`${inter.variable} ${robotoSlab.variable} ${dancingScript.variable} bg-background text-on-background font-body selection:bg-primary-fixed-dim selection:text-on-primary-fixed`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
