import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AvynMark, AvynWordmark } from "@/components/AvynLogo";

const LAST_UPDATED = "May 1, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#07071a", color: "#e2e8f0" }}>
      {/* Nav */}
      <header className="border-b px-6 py-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "#0a0014", boxShadow: "0 0 12px rgba(147,51,234,0.4)" }}>
              <AvynMark size={24} />
            </div>
            <span className="flex items-baseline gap-1 text-sm font-bold">
              <AvynWordmark /><span className="text-white">Commerce</span>
            </span>
          </Link>
          <Link href="/welcome" className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "#a78bfa" }}>Legal</p>
          <h1 className="text-4xl font-black text-white">Terms of Service</h1>
          <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-policy space-y-10">
          <Section title="1. Acceptance of Terms">
            <p>By accessing or using AVYN Commerce ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you are using the Service on behalf of an organization, you agree to these Terms on behalf of that organization and represent that you have the authority to do so. If you do not agree to these Terms, do not use the Service.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>AVYN Commerce is a SaaS platform that provides autonomous AI agent services for commerce operators, including product discovery, demand intelligence, supplier sourcing, buyer outreach, deal negotiation, and pipeline management. The Service is provided "as is" and we reserve the right to modify, suspend, or discontinue any feature at any time with reasonable notice.</p>
          </Section>

          <Section title="3. Account Registration">
            <ul>
              <li>You must provide accurate, complete, and current information when creating an account.</li>
              <li>You are responsible for maintaining the confidentiality of your credentials and for all activity under your account.</li>
              <li>You must be at least 16 years old to use the Service.</li>
              <li>You may not create accounts for others without their explicit consent.</li>
              <li>Notify us immediately at <a href="mailto:Ericduolo4@gmail.com" style={{ color: "#a78bfa" }}>Ericduolo4@gmail.com</a> if you suspect unauthorized access to your account.</li>
            </ul>
          </Section>

          <Section title="4. Subscription Plans and Billing">
            <p>AVYN Commerce offers multiple subscription tiers. By subscribing to a paid plan:</p>
            <ul>
              <li>You authorize us to charge your payment method on a recurring basis (monthly or annual) at the rate shown at checkout.</li>
              <li>Annual subscriptions are billed upfront. Cancellation of an annual plan entitles you to a prorated refund for unused complete months.</li>
              <li>We may change pricing with 30 days' notice. Continued use after the effective date constitutes acceptance.</li>
              <li>Platform commissions (where applicable per plan) are calculated on verified closed deals and are non-refundable once paid out.</li>
            </ul>
          </Section>

          <Section title="5. Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Send unsolicited commercial messages (spam) in violation of applicable law, including CAN-SPAM, CASL, or GDPR.</li>
              <li>Impersonate any person or entity, or falsely state your affiliation.</li>
              <li>Scrape, reverse engineer, or attempt to extract our source code, models, or training data.</li>
              <li>Circumvent rate limits, access controls, or security features.</li>
              <li>Use the Service in connection with illegal products, services, or activities.</li>
              <li>Interfere with or disrupt the integrity or performance of the Service.</li>
            </ul>
            <p>We reserve the right to suspend or terminate accounts that violate these rules without prior notice.</p>
          </Section>

          <Section title="6. AI-Generated Content">
            <p>The Service uses AI (including Anthropic's Claude) to generate outreach emails, negotiation responses, demand scores, and other content. You acknowledge that:</p>
            <ul>
              <li>AI-generated content may contain errors and should be reviewed before sending in high-stakes situations.</li>
              <li>You are solely responsible for the outreach you authorize the Service to send on your behalf.</li>
              <li>You must comply with all applicable email laws and obtain any required consents from recipients.</li>
              <li>We do not guarantee specific reply rates, conversion rates, or revenue outcomes.</li>
            </ul>
          </Section>

          <Section title="7. Intellectual Property">
            <p>AVYN Commerce and its underlying technology, trademarks, and brand assets are owned by AVYN Commerce, Inc. You retain ownership of your business data (products, buyer lists, outreach sequences). You grant us a limited license to process your data solely to provide the Service.</p>
          </Section>

          <Section title="8. Data and Privacy">
            <p>Our collection and use of personal information is governed by our <Link href="/privacy" style={{ color: "#a78bfa" }}>Privacy Policy</Link>, which is incorporated into these Terms by reference. By using the Service, you consent to such collection and use.</p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, AVYN Commerce, Inc. AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR THE USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
            <p>OUR TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.</p>
          </Section>

          <Section title="10. Indemnification">
            <p>You agree to indemnify, defend, and hold harmless AVYN Commerce, Inc. and its affiliates from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in any way connected with your access to or use of the Service, your violation of these Terms, or your violation of any third-party rights.</p>
          </Section>

          <Section title="11. Termination">
            <p>Either party may terminate the agreement at any time. We may suspend or terminate your access immediately if you breach these Terms. Upon termination, your right to use the Service ceases immediately. You may export your data up to 30 days after termination by contacting support.</p>
          </Section>

          <Section title="12. Dispute Resolution">
            <p>These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any dispute arising out of or relating to these Terms shall first be subject to good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration administered by JAMS under its Streamlined Arbitration Rules.</p>
          </Section>

          <Section title="13. Changes to Terms">
            <p>We may modify these Terms at any time. We will provide at least 14 days' notice of material changes via email or platform notification. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="14. Contact">
            <p>Questions about these Terms? Contact us at <a href="mailto:Ericduolo4@gmail.com" style={{ color: "#a78bfa" }}>Ericduolo4@gmail.com</a> or visit our <Link href="/contact" style={{ color: "#a78bfa" }}>contact page</Link>.</p>
          </Section>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-4 border-t pt-8 text-xs" style={{ borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
          <Link href="/privacy" className="hover:text-white/70 transition">Privacy Policy</Link>
          <span>·</span>
          <Link href="/contact" className="hover:text-white/70 transition">Contact Us</Link>
          <span>·</span>
          <Link href="/welcome" className="hover:text-white/70 transition">Back to Home</Link>
        </div>
      </div>

      <style>{`
        .prose-policy p { color: rgba(255,255,255,0.55); font-size: 14px; line-height: 1.8; margin-top: 12px; }
        .prose-policy ul { margin-top: 10px; padding-left: 20px; list-style: disc; color: rgba(255,255,255,0.55); font-size: 14px; line-height: 1.8; }
        .prose-policy li { margin-top: 6px; }
        .prose-policy strong { color: rgba(255,255,255,0.8); font-weight: 600; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold text-white">{title}</h2>
      {children}
    </div>
  );
}
