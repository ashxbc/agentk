import type { Metadata } from "next";
import { Inter, Roboto_Slab, Dancing_Script } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

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

const SITE_URL = "https://tryagentk.com";
const SITE_NAME = "AgentK";
const SITE_DESCRIPTION =
  "AgentK monitors Reddit 24/7 for your keywords and fires instant Telegram and Discord alerts the moment a matching post goes live. Free Reddit keyword monitoring tool — no credit card required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AgentK | Real-Time Reddit Keyword Monitoring & Alerts",
    template: "%s | AgentK",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Reddit monitoring",
    "Reddit keyword alerts",
    "Reddit notifications",
    "Reddit tracking tool",
    "Reddit mention tracker",
    "Reddit keyword monitoring",
    "Telegram Reddit alerts",
    "Discord Reddit alerts",
    "real-time Reddit alerts",
    "subreddit monitoring",
    "Reddit brand monitoring",
    "Reddit lead generation",
    "monitor Reddit posts",
    "Reddit marketing tool",
    "AgentK",
  ],
  authors: [{ name: "AgentK", url: SITE_URL }],
  creator: "AgentK",
  publisher: "AgentK",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "AgentK | Real-Time Reddit Keyword Monitoring & Alerts",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "AgentK — Monitor Reddit. Get alerted instantly.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentK | Real-Time Reddit Keyword Monitoring & Alerts",
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
    creator: "@agentk",
  },
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  verification: {
    google: "",
    other: {
      "msvalidate.01": "",
    },
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "AgentK",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description: SITE_DESCRIPTION,
  foundingDate: "2024",
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@agentk.io",
    contactType: "customer support",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AgentK",
  url: SITE_URL,
  description:
    "Real-time Reddit keyword monitoring tool that delivers instant Telegram and Discord alerts when matching posts appear in any subreddit.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free forever — no credit card required",
  },
  featureList: [
    "Real-time Reddit monitoring",
    "Instant Telegram alerts",
    "Discord notifications",
    "50 keywords per account",
    "5 subreddits per account",
    "Upvote and karma filters",
    "Alert cap control",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    ratingCount: "120",
    bestRating: "5",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "AgentK",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/dashboard`,
    },
    "query-input": "required name=search_term_string",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body
        className={`${inter.variable} ${robotoSlab.variable} ${dancingScript.variable} bg-background text-on-background font-body selection:bg-primary-fixed-dim selection:text-on-primary-fixed`}
      >
        <ConvexAuthNextjsServerProvider>
          <Providers>
            {children}
          </Providers>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
