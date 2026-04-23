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
  "Find people on Reddit actively asking for what you sell. AgentK scans subreddits 24/7, detects buyer-intent posts, and sends instant Telegram and Discord alerts in under 6 minutes. 100% free, no credit card.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AgentK | Free Reddit Lead Generation Tool. Find Leads on Reddit",
    template: "%s | AgentK",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "reddit lead generation",
    "find leads on reddit",
    "reddit lead gen tool",
    "reddit prospecting",
    "reddit buyer intent",
    "reddit sales tool",
    "free reddit leads",
    "reddit lead finder",
    "reddit b2b leads",
    "reddit marketing tool",
    "reddit monitoring for leads",
    "reddit intent monitoring",
    "Telegram Reddit alerts",
    "Discord Reddit alerts",
    "reddit keyword alerts",
    "subreddit lead generation",
    "reddit sales prospecting",
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
    title: "AgentK | Free Reddit Lead Generation Tool. Find Leads on Reddit",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "AgentK. Find leads on Reddit before anyone else.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentK | Free Reddit Lead Generation Tool. Find Leads on Reddit",
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
    google: "osLikFNsOupq2JJVz79jX-MJNSdNjGQVngCnjEt9VPA",
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
  description: "AgentK is a free Reddit lead generation tool that finds buyer-intent posts and delivers instant alerts via Telegram and Discord.",
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
    "Free Reddit lead generation tool. AgentK scans 430M+ Reddit users' posts every 5 minutes, detects buyer-intent signals matching your keywords, and delivers instant Telegram and Discord alerts so you can reach leads before anyone else.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free forever, no credit card required",
  },
  featureList: [
    "Reddit lead generation",
    "Buyer-intent post detection",
    "Instant Telegram lead alerts",
    "Discord lead notifications",
    "50 keywords per account",
    "5 subreddits per account",
    "Upvote and karma filters",
    "Alert cap control",
    "Save leads to lists",
    "AI-powered intent filtering",
    "Save leads from bot alerts",
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
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-8SJTQDNWVL" />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-8SJTQDNWVL');` }} />
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
