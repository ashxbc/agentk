import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import SocialProofFlow from "@/components/SocialProofFlow";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import GoogleLoginChecker from "@/components/GoogleLoginChecker";

const SITE_URL = "https://tryagentk.com";

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is AgentK and how does it find leads on Reddit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK is a free Reddit lead generation tool. It scans subreddits every 5 minutes, 24/7, looking for posts that match your keywords. The moment someone posts 'looking for a CRM' or 'need help with SEO' in your target subreddits, AgentK sends you an instant alert via Telegram or Discord. You reach that lead before any competitor even sees the post.",
      },
    },
    {
      "@type": "Question",
      name: "How fast does AgentK detect new leads on Reddit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK polls Reddit every 5 minutes around the clock. Most alerts land in under 6 minutes from the moment a post goes live. On Reddit, the first relevant reply wins attention. A 6-minute edge over competitors who check Reddit manually is the difference between closing a lead and watching someone else do it.",
      },
    },
    {
      "@type": "Question",
      name: "What kind of leads can I find on Reddit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Reddit has over 430 million users across 100,000+ active communities. Subreddits like r/entrepreneur, r/SaaS, r/startups, and r/smallbusiness are full of people asking for tool recommendations, hiring freelancers, describing pain points, and looking for services. Track phrases like 'looking for,' 'recommend a tool,' 'need help with,' or competitor brand names to surface buyer-intent posts the moment they appear.",
      },
    },
    {
      "@type": "Question",
      name: "How does AgentK deliver Reddit lead alerts?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Alerts go to Telegram or Discord. Each alert includes the post title, subreddit, author username, upvote count, comment count, and a direct link. Tap the link, read the post, and reply. You can also save any lead to a named list directly from the bot alert, no dashboard needed.",
      },
    },
    {
      "@type": "Question",
      name: "How many leads can I track simultaneously with AgentK?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Up to 50 keywords and 5 subreddits simultaneously, with no limit on alerts received. That means 50 different buying signals across 5 high-intent communities running in parallel, all day, every day, so you can focus on actually talking to leads.",
      },
    },
    {
      "@type": "Question",
      name: "Can I filter out low-quality Reddit leads?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Set minimum upvote thresholds, minimum comment counts, and minimum author karma to filter out spam, bots, and throwaway accounts. You can also cap max alerts per hour to prevent noise. The result: only real, high-signal posts reach you.",
      },
    },
    {
      "@type": "Question",
      name: "Can I save Reddit leads to a list?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Every post in the live feed has a save button. Click it to add the lead to a named list like Prospects, Hot Leads, or Follow-Ups. You can also save leads directly from Telegram or Discord bot alerts with one tap, without ever opening the dashboard.",
      },
    },
    {
      "@type": "Question",
      name: "Does AgentK have AI-powered lead filtering?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Switch to AI mode in the live feed to filter posts by intent instead of exact keywords. Describe what you're looking for in plain English, like 'startup founders looking for a dev tool', and AgentK uses AI to surface only posts that match that intent, cutting noise dramatically.",
      },
    },
    {
      "@type": "Question",
      name: "Is AgentK really free? Are there hidden costs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AgentK is 100% free. No credit card, no trial, no usage limits, no paid upgrade. Every feature is included free, forever: 50 keywords, 5 subreddits, unlimited alerts, Telegram and Discord notifications, save-to-list, and AI filtering. If that ever changes, existing users keep the free plan.",
      },
    },
    {
      "@type": "Question",
      name: "How do I start finding leads on Reddit today?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Takes 2 minutes. Sign up free with Google or email. Open the dashboard. Enter keywords your future customers would use. Pick the subreddits they hang out in. Connect Telegram or Discord. AgentK starts scanning immediately. No setup call, no onboarding form, no waiting.",
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
      <GoogleLoginChecker />
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
