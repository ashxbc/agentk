import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AgentK collects, uses, and protects your personal information when you use our Reddit monitoring and alert service.",
  alternates: { canonical: "https://agentk-delta.vercel.app/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPolicy() {
  const lastUpdated = "April 19, 2026";

  return (
    <div className="relative overflow-hidden">
      <Navbar />
      <main className="w-full max-w-3xl mx-auto px-6 pt-28 pb-24">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-secondary mb-12">Last updated: {lastUpdated}</p>

        <div className="prose prose-neutral max-w-none space-y-10 text-[#3a3530] leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">1. Introduction</h2>
            <p>
              AgentK (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the AgentK web application and associated
              services (collectively, the &quot;Service&quot;). This Privacy Policy explains how we collect,
              use, disclose, and safeguard your information when you use our Service. Please read
              this policy carefully. If you disagree with its terms, please discontinue use of
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">2. Information We Collect</h2>

            <h3 className="text-base font-semibold text-on-surface mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account information:</strong> Email address, display name, and password (hashed) when you register with email/password.</li>
              <li><strong>OAuth profile data:</strong> If you sign in via Google, we receive your name and email address as provided by Google.</li>
              <li><strong>Monitoring configuration:</strong> Keywords, subreddits, and notification preferences you configure within the dashboard.</li>
              <li><strong>Telegram chat ID:</strong> If you connect a Telegram account, we store your Telegram chat ID to deliver alerts.</li>
              <li><strong>Discord channel ID:</strong> If you connect a Discord account, we store your Discord channel ID to deliver alerts.</li>
            </ul>

            <h3 className="text-base font-semibold text-on-surface mt-5 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Usage data:</strong> Pages visited, features used, and actions taken within the Service.</li>
              <li><strong>Device and browser information:</strong> IP address, browser type, operating system, and referring URLs, collected via standard web server logs.</li>
              <li><strong>Session tokens:</strong> Encrypted session cookies set after authentication to maintain your logged-in state.</li>
            </ul>

            <h3 className="text-base font-semibold text-on-surface mt-5 mb-2">2.3 Reddit Data</h3>
            <p>
              We access Reddit&apos;s public API to monitor posts in subreddits you specify. We do
              not store Reddit post content beyond what is required to evaluate keyword matches and
              deliver your alerts. We do not access or store any private Reddit user data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Create and manage your account and authenticate your identity.</li>
              <li>Operate the keyword monitoring and alert delivery features you configure.</li>
              <li>Send Telegram and/or Discord notifications when a matching Reddit post is detected.</li>
              <li>Communicate service updates, security notices, or changes to this policy.</li>
              <li>Diagnose technical issues, ensure service reliability, and improve performance.</li>
              <li>Comply with applicable legal obligations.</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> sell, rent, or trade your personal information to third
              parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">4. Third-Party Services</h2>
            <p>We integrate with the following third-party services, each subject to their own privacy policies:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Convex (convex.dev):</strong> Our backend-as-a-service provider. Your data is
                stored on Convex infrastructure. See{" "}
                <a href="https://www.convex.dev/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-container underline">
                  Convex Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Google OAuth (accounts.google.com):</strong> Used for &quot;Sign in with Google.&quot;
                We receive your name and email address. See{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-container underline">
                  Google Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Telegram:</strong> Used to deliver post-match alerts to your Telegram account.
                Message delivery is handled via the Telegram Bot API.
              </li>
              <li>
                <strong>Discord:</strong> Used to deliver post-match alerts to your Discord server or
                channel via the Discord Bot API.
              </li>
              <li>
                <strong>Reddit API:</strong> Used to fetch public post data from subreddits you specify.
                We operate within Reddit&apos;s API terms of service.
              </li>
              <li>
                <strong>Vercel:</strong> Our hosting provider. Network-level data (IP addresses, request
                logs) may be processed by Vercel. See{" "}
                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary-container underline">
                  Vercel Privacy Policy
                </a>.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">5. Cookies and Session Storage</h2>
            <p>
              We use HTTP-only, secure cookies to maintain authenticated sessions. These cookies
              are strictly necessary for the Service to function and do not track you across
              third-party websites. We do not use advertising or analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">6. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. Monitoring
              configurations and alert history are retained to provide the Service. If you delete
              your account, we will delete or anonymize your personal data within 30 days, except
              where retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">7. Data Security</h2>
            <p>
              We implement industry-standard security measures including encrypted data transmission
              (TLS), hashed password storage, RSA-signed JWT authentication tokens, and access
              controls on our backend infrastructure. However, no method of transmission or storage
              is 100% secure. We cannot guarantee absolute security of your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access a copy of the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your account and associated personal data.</li>
              <li>Object to or restrict certain processing activities.</li>
              <li>Data portability (receive your data in a structured, machine-readable format).</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@agentk.io" className="text-primary-container underline">
                privacy@agentk.io
              </a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">9. Children&apos;s Privacy</h2>
            <p>
              The Service is not directed to individuals under the age of 13. We do not knowingly
              collect personal information from children under 13. If we become aware that a child
              under 13 has provided us personal information, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by updating the &quot;Last updated&quot; date at the top of this page and, where
              appropriate, by sending an email to the address associated with your account. Your
              continued use of the Service after changes become effective constitutes acceptance of
              the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">11. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <address className="not-italic mt-2 space-y-1">
              <p><strong>AgentK</strong></p>
              <p>
                Email:{" "}
                <a href="mailto:privacy@agentk.io" className="text-primary-container underline">
                  privacy@agentk.io
                </a>
              </p>
            </address>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  );
}
