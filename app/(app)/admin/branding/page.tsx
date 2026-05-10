"use client";
import {
  Bell,
  Check,
  Copy,
  Globe,
  Mail,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "aicos:branding:v1";

type BrandingState = {
  presetId: string;
  primary: string;
  accent: string;
  productName: string;
  tagline: string;
  logoEmoji: string;
  domain: string;
  emailSender: string;
  hideFooter: boolean;
  hideClaude: boolean;
};

const DEFAULTS: BrandingState = {
  presetId: "purple",
  primary: "#7c3aed",
  accent: "#a87dff",
  productName: "AVYN Commerce",
  tagline: "AI · Automation · Growth",
  logoEmoji: "✨",
  domain: "commerce.avyncommerce.com",
  emailSender: "hello@avyncommerce.com",
  hideFooter: true,
  hideClaude: false,
};

const PRESETS: {
  id: string;
  name: string;
  primary: string;
  bg: string;
  panel: string;
  accent: string;
}[] = [
  { id: "purple", name: "AVYN Default", primary: "#7c3aed", bg: "#0a0a14", panel: "#11111c", accent: "#a87dff" },
  { id: "ocean", name: "Ocean Blue", primary: "#0ea5e9", bg: "#06121f", panel: "#0c1b2c", accent: "#38bdf8" },
  { id: "emerald", name: "Emerald Stack", primary: "#10b981", bg: "#06150f", panel: "#0c1f17", accent: "#34d399" },
  { id: "sunset", name: "Sunset Coral", primary: "#f43f5e", bg: "#170810", panel: "#22101a", accent: "#fb7185" },
  { id: "amber", name: "Amber Atlas", primary: "#f59e0b", bg: "#15110a", panel: "#1f1a10", accent: "#fbbf24" },
  { id: "graphite", name: "Graphite", primary: "#94a3b8", bg: "#0b0f17", panel: "#141a26", accent: "#cbd5e1" },
];

const TIERS = [
  { id: "include", name: "Included with Enterprise", price: "$0", desc: "1 workspace, basic logo + color, branded email" },
  { id: "agency", name: "Agency White-label", price: "$2,500/mo", desc: "Up to 25 sub-workspaces, custom domain per client, removed footer", popular: true },
  { id: "platform", name: "Full Platform OEM", price: "$25K setup + $5K/mo", desc: "Unlimited workspaces, custom subdomain pattern, branded mobile, dedicated infra" },
];

export default function BrandingPage() {
  const [presetId, setPresetId] = useState(DEFAULTS.presetId);
  const [primary, setPrimary] = useState(DEFAULTS.primary);
  const [accent, setAccent] = useState(DEFAULTS.accent);
  const [productName, setProductName] = useState(DEFAULTS.productName);
  const [tagline, setTagline] = useState(DEFAULTS.tagline);
  const [logoEmoji, setLogoEmoji] = useState(DEFAULTS.logoEmoji);
  const [domain, setDomain] = useState(DEFAULTS.domain);
  const [emailSender, setEmailSender] = useState(DEFAULTS.emailSender);
  const [hideFooter, setHideFooter] = useState(DEFAULTS.hideFooter);
  const [hideClaude, setHideClaude] = useState(DEFAULTS.hideClaude);

  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as BrandingState;
        setPresetId(s.presetId ?? DEFAULTS.presetId);
        setPrimary(s.primary ?? DEFAULTS.primary);
        setAccent(s.accent ?? DEFAULTS.accent);
        setProductName(s.productName ?? DEFAULTS.productName);
        setTagline(s.tagline ?? DEFAULTS.tagline);
        setLogoEmoji(s.logoEmoji ?? DEFAULTS.logoEmoji);
        setDomain(s.domain ?? DEFAULTS.domain);
        setEmailSender(s.emailSender ?? DEFAULTS.emailSender);
        setHideFooter(s.hideFooter ?? DEFAULTS.hideFooter);
        setHideClaude(s.hideClaude ?? DEFAULTS.hideClaude);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      setDirty(true);
      setSaved(false);
    }
  }, [presetId, primary, accent, productName, tagline, logoEmoji, domain, emailSender, hideFooter, hideClaude, hydrated]);

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setPrimary(p.primary);
    setAccent(p.accent);
  }

  function handleSave() {
    const data: BrandingState = {
      presetId,
      primary,
      accent,
      productName,
      tagline,
      logoEmoji,
      domain,
      emailSender,
      hideFooter,
      hideClaude,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
  }

  function handleReset() {
    setPresetId(DEFAULTS.presetId);
    setPrimary(DEFAULTS.primary);
    setAccent(DEFAULTS.accent);
    setProductName(DEFAULTS.productName);
    setTagline(DEFAULTS.tagline);
    setLogoEmoji(DEFAULTS.logoEmoji);
    setDomain(DEFAULTS.domain);
    setEmailSender(DEFAULTS.emailSender);
    setHideFooter(DEFAULTS.hideFooter);
    setHideClaude(DEFAULTS.hideClaude);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">White-label &amp; Branding</h1>
            <p className="text-xs text-ink-secondary">
              Rebrand the OS for your agency or resell to your customers
            </p>
          </div>
        </div>
        {/* No banner space here; render below the header */}
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-1 text-[11px] font-semibold text-accent-green">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {dirty && !saved && (
            <span className="rounded-md bg-accent-amber/15 px-2 py-1 text-[11px] font-semibold text-accent-amber">
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Save changes
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <Sparkles className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-amber">White-label preview</span>
            {" "}
            — Logo, color, and copy edits persist locally so you can preview the look. The live
            theming pipeline (per-tenant CSS injection + custom domain on agency/Enterprise plans)
            ships in a follow-up. The Settings → Appearance light/dark toggle works platform-wide
            today.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Settings panel */}
        <div className="space-y-5">
          <Section title="Brand Identity" Icon={Sparkles}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[80px_1fr]">
              <div>
                <Label>Logo</Label>
                <button className="grid aspect-square w-20 place-items-center rounded-xl border-2 border-dashed border-bg-border bg-bg-hover/40 text-3xl hover:border-brand-500/60">
                  {logoEmoji}
                </button>
                <button className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-300 hover:text-brand-200">
                  <Upload className="h-3 w-3" /> Upload
                </button>
              </div>
              <div className="space-y-3">
                <FieldInline label="Product Name" value={productName} onChange={setProductName} />
                <FieldInline label="Tagline" value={tagline} onChange={setTagline} />
                <div>
                  <Label>Quick logo emoji</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["✨", "🛍️", "📦", "🤖", "🚀", "🔮", "🌐", "⚡"].map((e) => (
                      <button
                        key={e}
                        onClick={() => setLogoEmoji(e)}
                        className={`grid h-9 w-9 place-items-center rounded-md border text-lg ${
                          logoEmoji === e
                            ? "border-brand-500/60 bg-brand-500/15"
                            : "border-bg-border bg-bg-hover/40"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Color Theme" Icon={Palette}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`overflow-hidden rounded-lg border text-left ${
                    presetId === p.id ? "border-brand-500/60 ring-1 ring-brand-500/40" : "border-bg-border"
                  }`}
                >
                  <div className="flex h-12 items-center gap-1 px-3" style={{ background: p.bg }}>
                    <span className="h-3 w-3 rounded-full" style={{ background: p.primary }} />
                    <span className="h-3 w-3 rounded-full" style={{ background: p.accent }} />
                    <span className="ml-auto h-3 w-12 rounded" style={{ background: p.panel }} />
                  </div>
                  <div className="px-3 py-2 text-xs font-medium">{p.name}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ColorField label="Primary" value={primary} onChange={setPrimary} />
              <ColorField label="Accent" value={accent} onChange={setAccent} />
            </div>
          </Section>

          <Section title="Custom Domain" Icon={Globe}>
            <FieldInline
              label="Workspace URL"
              value={domain}
              onChange={setDomain}
              placeholder="commerce.yourdomain.com"
            />
            <div className="mt-2 rounded-lg border border-bg-border bg-bg-hover/40 p-3 text-xs">
              <div className="font-semibold">DNS verification</div>
              <div className="mt-1 grid grid-cols-[80px_1fr_auto] items-center gap-2 font-mono text-[11px] text-ink-secondary">
                <span className="text-ink-tertiary">CNAME</span>
                <span className="truncate">{domain} → tenant.aicommerce.os</span>
                <span className="rounded-md bg-accent-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-green">
                  Verified
                </span>
              </div>
            </div>
          </Section>

          <Section title="Email Sender" Icon={Mail}>
            <FieldInline
              label="Outbound 'from' address"
              value={emailSender}
              onChange={setEmailSender}
              placeholder="hello@yourdomain.com"
            />
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              {(["SPF", "DKIM", "DMARC"] as const).map((r) => (
                <div
                  key={r}
                  className="flex items-center justify-between rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1.5"
                >
                  <span className="text-ink-secondary">{r}</span>
                  <span className="rounded bg-accent-green/15 px-1.5 text-[10px] font-semibold text-accent-green">
                    OK
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Footer & Attribution" Icon={Bell}>
            <Toggle
              label='Hide "Powered by AVYN Commerce" footer'
              hint="Removes the platform attribution from every page (Agency tier and above)"
              value={hideFooter}
              onChange={setHideFooter}
            />
            <Toggle
              label="Hide Claude attribution in AI replies"
              hint="Removes the 'AI by Claude' tag in outreach drafts and quotes"
              value={hideClaude}
              onChange={setHideClaude}
            />
          </Section>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
            Live Preview
          </div>

          <PreviewWindow
            primary={primary}
            accent={accent}
            productName={productName}
            tagline={tagline}
            logoEmoji={logoEmoji}
            hideFooter={hideFooter}
          />

          <PreviewEmail
            primary={primary}
            productName={productName}
            sender={emailSender}
            hideClaude={hideClaude}
          />
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold">White-label tiers</h2>
        <p className="text-xs text-ink-tertiary">
          Choose how deeply you want to rebrand the platform
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-5 ${
                t.popular
                  ? "border-brand-500/60 bg-gradient-to-br from-brand-500/10 to-transparent shadow-glow"
                  : "border-bg-border bg-bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-bold">{t.name}</div>
                {t.popular && (
                  <span className="rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Popular
                  </span>
                )}
              </div>
              <div className="mt-2 text-2xl font-bold">{t.price}</div>
              <p className="mt-2 text-xs text-ink-secondary">{t.desc}</p>
              <button
                className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold ${
                  t.popular
                    ? "bg-gradient-brand shadow-glow"
                    : "border border-bg-border bg-bg-hover/40 hover:bg-bg-hover"
                }`}
              >
                {t.id === "include" ? "Activate" : "Talk to sales"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-brand-300" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
      {children}
    </div>
  );
}

function FieldInline({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <label className="block text-xs">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent font-mono text-xs uppercase focus:outline-none"
        />
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          }}
          className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
        >
          {copied ? <Check className="h-3 w-3 text-accent-green" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </label>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-bg-border bg-bg-hover/30 p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-ink-tertiary">{hint}</div>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          onChange(!value);
        }}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          value ? "bg-gradient-brand" : "bg-bg-hover"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            value ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function PreviewWindow({
  primary,
  accent,
  productName,
  tagline,
  logoEmoji,
  hideFooter,
}: {
  primary: string;
  accent: string;
  productName: string;
  tagline: string;
  logoEmoji: string;
  hideFooter: boolean;
}) {
  const gradient = `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`;
  return (
    <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-bg-border bg-bg-panel px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-accent-red/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent-amber/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent-green/70" />
        <span className="ml-3 text-[10px] text-ink-tertiary">
          commerce.avyncommerce.com
        </span>
      </div>
      <div className="flex">
        <div className="w-32 border-r border-bg-border bg-bg-panel py-3">
          <div className="flex items-center gap-2 px-3">
            <div
              className="grid h-7 w-7 place-items-center rounded-md text-white"
              style={{ background: gradient }}
            >
              {logoEmoji}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[10px] font-semibold leading-tight">
                {productName}
              </div>
              <div className="truncate text-[8px] text-ink-tertiary">{tagline}</div>
            </div>
          </div>
          <div className="mt-3 space-y-0.5 px-2">
            {["Dashboard", "Products", "Buyers", "Outreach", "CRM"].map((s, i) => (
              <div
                key={s}
                className={`rounded px-2 py-1 text-[9px] ${
                  i === 0 ? "text-white" : "text-ink-secondary"
                }`}
                style={i === 0 ? { background: `${primary}25`, color: accent } : undefined}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 p-3">
          <div className="flex h-7 items-center gap-2 rounded-md border border-bg-border bg-bg-card px-2">
            <Search className="h-3 w-3 text-ink-tertiary" />
            <span className="text-[9px] text-ink-tertiary">Search anything…</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { l: "Opportunities", v: "1,283" },
              { l: "Buyers", v: "2,451" },
              { l: "Pipeline", v: "$1.26M" },
            ].map((c, i) => (
              <div
                key={c.l}
                className="rounded-md border border-bg-border bg-bg-card p-2"
              >
                <div className="text-[7px] uppercase tracking-wider text-ink-tertiary">
                  {c.l}
                </div>
                <div
                  className="mt-0.5 text-[12px] font-bold"
                  style={i === 0 ? { color: accent } : undefined}
                >
                  {c.v}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-md border border-bg-border bg-bg-card p-2">
            <div className="text-[8px] font-semibold">Top Products</div>
            <div className="mt-1 space-y-1">
              {["Portable Blender", "LED Strip Lights", "Pet Hair Roller"].map((p) => (
                <div key={p} className="flex items-center justify-between text-[8px]">
                  <span className="text-ink-secondary">{p}</span>
                  <span style={{ color: accent }}>+28%</span>
                </div>
              ))}
            </div>
          </div>
          <button
            className="mt-2 w-full rounded-md py-1 text-[9px] font-semibold text-white"
            style={{ background: gradient }}
          >
            Run Trend Scan
          </button>
        </div>
      </div>
      {!hideFooter && (
        <div className="border-t border-bg-border bg-bg-panel py-1.5 text-center text-[8px] text-ink-tertiary">
          Powered by AVYN Commerce
        </div>
      )}
    </div>
  );
}

function PreviewEmail({
  primary,
  productName,
  sender,
  hideClaude,
}: {
  primary: string;
  productName: string;
  sender: string;
  hideClaude: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
      <div className="border-b border-bg-border bg-bg-panel px-3 py-2 text-[10px] text-ink-tertiary">
        From: {sender} · Subject: Quick idea for FitLife Stores
      </div>
      <div className="bg-white p-4 text-[11px] text-gray-800">
        <div
          className="mb-3 inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ background: primary }}
        >
          {productName}
        </div>
        <p>Hi Sarah,</p>
        <p className="mt-2">
          Saw FitLife Stores recently expanded resistance band SKUs. We&apos;ve got
          a portable cup option trending +340% on TikTok with strong margin at
          your typical retail.
        </p>
        <p className="mt-2">Open to a 15-min call next week?</p>
        <p className="mt-3">— Marcus</p>
        {!hideClaude && (
          <p className="mt-4 text-[8px] text-gray-400">
            AI-personalized via Claude Sonnet 4.6
          </p>
        )}
      </div>
    </div>
  );
}
