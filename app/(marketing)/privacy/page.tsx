import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AvynMark, AvynWordmark } from "@/components/AvynLogo";

const LAST_UPDATED = "May 1, 2026";

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-black text-white">Privacy Policy</h1>
          <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-policy space-y-10">
          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us when you create an account, use our services, or contact us for support. This includes:</p>
            <ul>
              <li><strong>Account data:</strong> Name, email address, company name, job title, and phone number.</li>
              <li><strong>Usage data:</strong> Pages visited, features used, agent interactions, and session duration, collected automatically via server logs and first-party analytics.</li>
              <li><strong>Business data:</strong> Products, buyers, and outreach sequences you manage within the platform.</li>
              <li><strong>Communications:</strong> Messages you send via the platform, including AI-generated outreach content.</li>
            </ul>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul>
              <li>Operate, maintain, and improve AVYN Commerce and its AI agent network.</li>
              <li>Personalise your agent configuration and outreach strategies.</li>
              <li>Send transactional emails such as account confirmations and usage alerts.</li>
              <li>Detect, investigate, and prevent fraudulent or harmful activity.</li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p><strong>We never use your data to train base AI models.</strong> Your business data is yours — isolated to your workspace and not shared with other operators.</p>
          </Section>

          <Section title="3. Data Sharing">
            <p>We do not sell, rent, or trade your personal information. We may share data with:</p>
            <ul>
              <li><strong>Service providers:</strong> Infrastructure providers (hosting, storage, email delivery) who process data on our behalf under strict confidentiality agreements.</li>
              <li><strong>AI model providers:</strong> Anonymised prompts may be processed by Anthropic (Claude API) to generate outreach content. See Anthropic's privacy policy for details.</li>
              <li><strong>Legal requirements:</strong> When required by law, court order, or governmental authority.</li>
            </ul>
          </Section>

          <Section title="4. Data Retention">
            <p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us at <a href="mailto:Ericduolo4@gmail.com" style={{ color: "#a78bfa" }}>Ericduolo4@gmail.com</a>.</p>
            <ul>
              <li>System logs: 30 days (Growth) · 1 year (Enterprise)</li>
              <li>Audit logs: 7 years (regulatory requirement)</li>
              <li>Buyer enrichment cache: 180 days after last access</li>
            </ul>
          </Section>

          <Section title="5. Security">
            <p>AVYN Commerce is SOC 2 Type II certified and uses AES-256 encryption at rest and TLS 1.3 in transit. We enforce two-factor authentication for admin accounts and conduct regular penetration testing. Despite these measures, no system is 100% secure — please use a strong, unique password and enable 2FA.</p>
          </Section>

          <Section title="6. Cookies">
            <p>We use essential cookies for authentication and session management. We do not use third-party advertising cookies. See our <Link href="/terms" style={{ color: "#a78bfa" }}>Terms of Service</Link> and the cookie banner on our site for full details.</p>
          </Section>

          <Section title="7. Your Rights (GDPR / CCPA)">
            <p>Depending on your location, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate data.</li>
              <li>Request deletion ("right to be forgotten").</li>
              <li>Object to or restrict certain processing.</li>
              <li>Receive your data in a portable format.</li>
            </ul>
            <p>To exercise any of these rights, email <a href="mailto:Ericduolo4@gmail.com" style={{ color: "#a78bfa" }}>Ericduolo4@gmail.com</a>. We will respond within 30 days.</p>
          </Section>

          <Section title="8. International Transfers">
            <p>AVYN Commerce is operated from the United States. If you are located in the European Economic Area, United Kingdom, or elsewhere, your data may be transferred to and processed in the US. We rely on Standard Contractual Clauses (SCCs) for such transfers where required.</p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>AVYN Commerce is not directed at individuals under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us immediately.</p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a prominent notice on the platform at least 14 days before the change takes effect. Continued use of the platform after the effective date constitutes acceptance.</p>
          </Section>

          <Section title="11. Contact Us">
            <p>For any privacy-related questions or requests:</p>
            <ul>
              <li>Email: <a href="mailto:Ericduolo4@gmail.com" style={{ color: "#a78bfa" }}>Ericduolo4@gmail.com</a></li>
              <li>Address: AVYN Commerce, Inc., United States</li>
            </ul>
          </Section>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-4 border-t pt-8 text-xs" style={{ borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
          <Link href="/terms" className="hover:text-white/70 transition">Terms of Service</Link>
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
