import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms and conditions governing your use of AgentK's Reddit monitoring and keyword alert service.",
  alternates: { canonical: "https://agentk-delta.vercel.app/terms" },
  robots: { index: true, follow: true },
};

export default function TermsOfService() {
  const lastUpdated = "April 19, 2026";

  return (
    <div className="relative overflow-hidden">
      <Navbar />
      <main className="w-full max-w-3xl mx-auto px-6 pt-28 pb-24">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-secondary mb-12">Last updated: {lastUpdated}</p>

        <div className="prose prose-neutral max-w-none space-y-10 text-[#3a3530] leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">1. Agreement to Terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between
              you (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) and AgentK (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) governing
              your access to and use of the AgentK web application, APIs, bots, and all related
              services (collectively, the &quot;Service&quot;). By creating an account or using the Service,
              you confirm that you have read, understood, and agree to be bound by these Terms and
              our{" "}
              <a href="/privacy" className="text-primary-container underline">Privacy Policy</a>.
            </p>
            <p className="mt-3">
              If you do not agree to these Terms, you must not access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years of age to use the Service. By using the Service, you
              represent and warrant that you meet this requirement and that you have the legal
              capacity to enter into these Terms. If you are accessing the Service on behalf of a
              company or other legal entity, you represent that you have the authority to bind that
              entity to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">3. Account Registration</h2>
            <p>
              To access certain features, you must create an account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide accurate, current, and complete information during registration.</li>
              <li>Maintain the security of your credentials and not share your password.</li>
              <li>Promptly notify us of any unauthorized use of your account.</li>
              <li>Accept responsibility for all activity that occurs under your account.</li>
            </ul>
            <p className="mt-3">
              We reserve the right to suspend or terminate accounts that violate these Terms or
              are used for fraudulent or unauthorized purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">4. Description of Service</h2>
            <p>
              AgentK monitors publicly accessible Reddit posts in subreddits you specify and
              delivers real-time alerts via Telegram and/or Discord when posts containing your
              configured keywords are detected. The Service operates using Reddit&apos;s public API
              and is subject to Reddit&apos;s own terms of service and API usage policies.
            </p>
            <p className="mt-3">
              We do not guarantee continuous, uninterrupted, or error-free access to Reddit data.
              Reddit API changes, rate limits, or subreddit access restrictions may affect Service
              functionality.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">5. Acceptable Use</h2>
            <p>You agree to use the Service only for lawful purposes. You must not:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service to harass, stalk, threaten, or harm any individual.</li>
              <li>Configure monitoring for the purpose of illegal surveillance or data scraping at scale.</li>
              <li>Attempt to circumvent, disable, or interfere with security features of the Service.</li>
              <li>Access or attempt to access other users&apos; accounts or data without authorization.</li>
              <li>Use the Service to transmit malware, spam, or other harmful content.</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of the Service.</li>
              <li>Resell, sublicense, or commercially exploit the Service without our prior written consent.</li>
              <li>Use the Service in any way that violates Reddit&apos;s, Telegram&apos;s, or Discord&apos;s terms of service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">6. Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are and will remain
              the exclusive property of AgentK and its licensors. Our trademarks, trade dress, and
              logos may not be used in connection with any product or service without our prior
              written consent.
            </p>
            <p className="mt-3">
              You retain ownership of any content you provide to configure the Service (e.g.,
              keyword lists, subreddit names). By providing such content, you grant us a limited,
              non-exclusive license to use it solely for the purpose of operating the Service on
              your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">7. Third-Party Services</h2>
            <p>
              The Service integrates with third-party platforms including Reddit, Telegram, Discord,
              and Google. Your use of these platforms is subject to their respective terms of service
              and privacy policies. We are not responsible for the practices, content, or availability
              of any third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">8. Service Availability and Modifications</h2>
            <p>
              We strive to maintain high availability but do not guarantee that the Service will
              be uninterrupted or error-free. We reserve the right to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Modify, suspend, or discontinue any part of the Service at any time.</li>
              <li>Perform scheduled or emergency maintenance that may temporarily affect availability.</li>
              <li>Change pricing, features, or functionality with reasonable notice where practicable.</li>
            </ul>
            <p className="mt-3">
              We will endeavor to provide advance notice of material changes via email or
              in-application notification.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES
              OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR UNINTERRUPTED
              ACCESS. WE DO NOT WARRANT THAT THE SERVICE WILL MEET YOUR REQUIREMENTS OR THAT
              ALERTS WILL BE DELIVERED WITHIN ANY PARTICULAR TIMEFRAME.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, AGENTK AND ITS AFFILIATES,
              OFFICERS, EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS,
              DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO
              USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mt-3">
              OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL
              NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING
              THE CLAIM OR (B) USD $50.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">11. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless AgentK and its affiliates, officers,
              directors, employees, and agents from and against any claims, liabilities, damages,
              losses, and expenses (including reasonable legal fees) arising out of or relating to
              your use of the Service, your violation of these Terms, or your violation of any
              third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">12. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service immediately, without prior
              notice or liability, for any reason, including if you breach these Terms. Upon
              termination, your right to use the Service ceases immediately.
            </p>
            <p className="mt-3">
              You may terminate your account at any time by contacting us or using the account
              deletion feature in settings. Sections 6, 9, 10, 11, and 13 shall survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">13. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable law,
              without regard to conflict-of-law principles. Any dispute arising from or relating
              to these Terms or the Service shall first be attempted to be resolved through good-faith
              negotiation. If unresolved after 30 days, disputes shall be submitted to binding
              arbitration, except that either party may seek injunctive relief in a court of
              competent jurisdiction for violations of intellectual property rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">14. Changes to These Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will provide notice of
              material changes by updating the &quot;Last updated&quot; date and, where appropriate, by
              sending an email notification. Your continued use of the Service after changes become
              effective constitutes acceptance of the revised Terms. If you do not agree to the
              revised Terms, you must stop using the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3">15. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us:
            </p>
            <address className="not-italic mt-2 space-y-1">
              <p><strong>AgentK</strong></p>
              <p>
                Email:{" "}
                <a href="mailto:legal@agentk.io" className="text-primary-container underline">
                  legal@agentk.io
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
