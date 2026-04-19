import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import SocialProofFlow from "@/components/SocialProofFlow";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const SITE_URL = "https://agentk-delta.vercel.app";

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is AgentK and how does Reddit monitoring work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK is a real-time Reddit monitoring tool that scans any subreddit every 2 minutes for posts matching your keywords. The moment a match is detected, you receive an instant alert via Telegram or Discord — no manual checking, no delays. Simply set your keywords, choose your subreddits, and AgentK runs 24/7 in the background.",
      },
    },
    {
      "@type": "Question",
      name: "How fast are the Reddit keyword alerts?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK polls Reddit every 2 minutes around the clock. When a new post matches your tracked keywords, the alert fires within seconds of detection — typically under 3 minutes from the moment the post goes live.",
      },
    },
    {
      "@type": "Question",
      name: "Which notification channels does AgentK support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK delivers alerts via Telegram and Discord. Connect your Telegram account or Discord server from the dashboard in one step — no code required. Each alert includes the post title, subreddit, author, upvote count, comment count, and a direct link to the post.",
      },
    },
    {
      "@type": "Question",
      name: "How many keywords and subreddits can I track?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can track up to 50 keywords and 5 subreddits simultaneously on the free plan. There is no limit on the number of alerts you receive.",
      },
    },
    {
      "@type": "Question",
      name: "Can I filter alerts by upvotes, comments, or author karma?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. AgentK includes granular filters so you only get alerted on posts that matter. You can set minimum upvote thresholds, minimum comment counts, and minimum author karma. You can also cap the maximum number of alerts per hour.",
      },
    },
    {
      "@type": "Question",
      name: "Is AgentK free? Are there hidden costs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK is completely free to use with no credit card required. There are no hidden fees, rate limits, or trial periods. The free plan includes 50 keywords, 5 subreddits, unlimited alerts, Telegram and Discord notifications, and all filtering features.",
      },
    },
    {
      "@type": "Question",
      name: "What are the best use cases for Reddit keyword monitoring?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK is used by founders tracking competitor mentions, sales teams catching 'looking for a tool like X' posts, marketers monitoring brand sentiment, recruiters finding job-seeking posts, investors tracking industry discussions, and community managers staying on top of their brand name.",
      },
    },
    {
      "@type": "Question",
      name: "How is AgentK different from Reddit's own notification system?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Reddit's native notifications only alert you to activity on posts you've already interacted with. AgentK proactively scans any subreddit for any keyword, including posts from complete strangers, giving you first-mover advantage to comment, DM, or engage before anyone else.",
      },
    },
    {
      "@type": "Question",
      name: "Is my data private and secure?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Your keywords, subreddit list, and account data are stored securely with encrypted transmission (TLS) and hashed authentication. AgentK never posts on your behalf, never accesses your Reddit account, and never shares or sells your data to third parties.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get started with Reddit monitoring?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Getting started takes under 2 minutes. Create a free account using Google or email, open the dashboard, enter your keywords, select your subreddits, and connect your Telegram bot or Discord server. AgentK begins monitoring immediately — no setup calls, no onboarding forms, no waiting period.",
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="relative overflow-hidden">
        <Navbar />

        <main className="relative z-10 w-full max-w-[1435px] min-h-[calc(100vh-80px)] mx-auto pt-16 flex flex-col justify-center">
          <Hero />
        </main>

        <SocialProofFlow />
        <Pricing />
        <FAQ />
        <Footer />
      </div>
    </>
  );
}
