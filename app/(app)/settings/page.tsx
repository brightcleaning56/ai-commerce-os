"use client";
import { ArrowRight, Bell, Check, Globe, Lock, Palette, Shield, ShieldCheck, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { useCapabilities } from "@/components/CapabilityContext";

const STORAGE_KEY = "aicos:settings:v1";

type SettingsState = {
  name: string;
  email: string;
  tz: string;
  locale: string;
  defaultModel: string;
  defaultMode: string;
  notif: {
    deals: boolean;
    risk: boolean;
    weekly: boolean;
    digest: boolean;
    mentions: boolean;
  };
};

const DEFAULTS: SettingsState = {
  name: "",
  email: "",
  tz: "America/New_York",
  locale: "en-US",
  defaultModel: "Claude Sonnet 4.6 (balanced)",
  defaultMode: "Auto with approval queue",
  notif: { deals: true, risk: true, weekly: true, digest: false, mentions: true },
};

export default function SettingsPage() {
  const [name, setName] = useState(DEFAULTS.name);
  const [email, setEmail] = useState(DEFAULTS.email);
  const [title, setTitle] = useState("Founder");
  const [initials, setInitials] = useState("?");
  const [tz, setTz] = useState(DEFAULTS.tz);
  const [locale, setLocale] = useState(DEFAULTS.locale);
  const [defaultModel, setDefaultModel] = useState(DEFAULTS.defaultModel);
  const [defaultMode, setDefaultMode] = useState(DEFAULTS.defaultMode);
  const [notif, setNotif] = useState(DEFAULTS.notif);

  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Identity hydration is identity-aware now. Owner sessions get the
  // rich profile from /api/operator (driven by OPERATOR_* env vars).
  // Per-user sessions display THEIR own email + role instead of leaking
  // the owner's identity. /api/auth/me is the source of truth for
  // "who am I"; /api/operator is owner-only data.
  const { me, refresh: refreshMe } = useCapabilities();
  const isOwner = !!me?.isOwner;
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  useEffect(() => {
    if (!me) return;
    if (me.isOwner) {
      fetch("/api/operator")
        .then((r) => r.json())
        .then((op) => {
          if (op?.name) {
            setName((prev) => prev || op.name);
            setEmail((prev) => prev || op.email);
            setTitle(op.title || "Owner");
            setInitials(op.initials || op.name.slice(0, 2).toUpperCase());
          }
        })
        .catch(() => {});
    } else {
      // Per-user session. Email + role come from the (signed) token
      // and are immutable here. displayName + phone come from the
      // per-user profile (server-side, lib/userProfiles.ts) and ARE
      // editable. Initials default to first letter of name or email.
      setEmail(me.email);
      setTitle(me.role);
      setName(me.name ?? "");
      setInitials(me.initials ?? (me.email[0] ?? "?").toUpperCase());
      setPhone(me.phone ?? "");
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SettingsState;
        // For Owner sessions: localStorage can override name/email
        // (operator may have customized). For non-Owner sessions: NEVER
        // let localStorage override identity — that field could carry
        // the owner's name from a previous session and leak it.
        if (me?.isOwner && s.name) setName(s.name);
        if (me?.isOwner && s.email) setEmail(s.email);
        setTz(s.tz ?? DEFAULTS.tz);
        setLocale(s.locale ?? DEFAULTS.locale);
        setDefaultModel(s.defaultModel ?? DEFAULTS.defaultModel);
        setDefaultMode(s.defaultMode ?? DEFAULTS.defaultMode);
        setNotif({ ...DEFAULTS.notif, ...(s.notif ?? {}) });
      }
    } catch {}
    setHydrated(true);
  }, [me]);

  // Mark dirty on change
  useEffect(() => {
    if (hydrated) {
      setDirty(true);
      setSaved(false);
    }
  }, [name, tz, locale, defaultModel, defaultMode, notif, hydrated]);

  function handleSave() {
    // Owner sessions persist name/email so the operator can customize.
    // Non-owner sessions persist preferences only — never write identity
    // to localStorage (would leak across user sessions on the same browser).
    const data: Partial<SettingsState> = isOwner
      ? { name, email, tz, locale, defaultModel, defaultMode, notif }
      : { tz, locale, defaultModel, defaultMode, notif };
    if (isOwner) {
      setInitials(
        name.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("") || "?",
      );
    }
    try {
      // Merge with existing keys so we don't blow away preferences the
      // user has set in another flow.
      const raw = localStorage.getItem(STORAGE_KEY);
      const prev = raw ? (JSON.parse(raw) as Partial<SettingsState>) : {};
      const merged = { ...prev, ...data };
      // For non-owner: actively scrub any leftover name/email from a
      // prior owner session so the next "owner-loads-from-localStorage"
      // path doesn't pull stale data.
      if (!isOwner) {
        delete (merged as Partial<SettingsState>).name;
        delete (merged as Partial<SettingsState>).email;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-xs text-ink-secondary">Personal preferences for your account</p>
          </div>
        </div>
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
            onClick={handleSave}
            disabled={!dirty}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title="Profile" Icon={User}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-brand text-sm font-bold">
                {initials}
              </div>
              {isOwner && (
                <button className="rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs hover:bg-bg-hover">
                  Upload photo
                </button>
              )}
            </div>
            {/* Owner: Full name + Email are derived from OPERATOR_*
                env vars; Title comes from there too. localStorage can
                override name/email for casual customization.
                Non-owner: Email + Title come from the signed token
                (immutable). Display name + phone are editable via
                /api/users/me. */}
            <Field
              label={isOwner ? "Full name" : "Display name"}
              value={name}
              onChange={setName}
              placeholder={isOwner ? undefined : "How you want to appear in the app"}
            />
            <Field label="Email" value={email} onChange={() => {}} disabled />
            <Field label="Title" value={title} onChange={() => {}} disabled />
            {!isOwner && (
              <>
                <Field
                  label="Phone (optional)"
                  value={phone}
                  onChange={setPhone}
                  placeholder="+1 555 555 1234"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setSavingProfile(true);
                    try {
                      const r = await fetch("/api/users/me", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          displayName: name,
                          phone,
                        }),
                      });
                      if (!r.ok) {
                        const d = await r.json().catch(() => ({}));
                        throw new Error(d.error ?? `Profile save failed (${r.status})`);
                      }
                      // Refresh /api/auth/me so the TopBar / sidebar
                      // pick up the new displayName immediately.
                      await refreshMe();
                    } catch (e) {
                      console.warn("Profile save:", e instanceof Error ? e.message : e);
                    } finally {
                      setSavingProfile(false);
                    }
                  }}
                  disabled={savingProfile}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-brand px-3 py-2 text-[12px] font-semibold shadow-glow disabled:opacity-50"
                >
                  {savingProfile ? "Saving…" : "Save profile"}
                </button>
                <p className="text-[11px] text-ink-tertiary">
                  Email + title come from your signed-in role and can&apos;t be edited here.
                  Locale, AI defaults, theme, and notification preferences below save to
                  your browser.
                </p>
              </>
            )}
          </div>
        </Section>

        <Section title="Locale" Icon={Globe}>
          <div className="space-y-3">
            <Select label="Time zone" value={tz} onChange={setTz} options={[
              "America/New_York",
              "America/Los_Angeles",
              "America/Chicago",
              "Europe/London",
              "Europe/Berlin",
              "Asia/Tokyo",
              "Australia/Sydney",
            ]} />
            <Select label="Locale" value={locale} onChange={setLocale} options={[
              "en-US",
              "en-GB",
              "de-DE",
              "fr-FR",
              "ja-JP",
              "es-MX",
            ]} />
            <Select label="Currency" value="USD" onChange={() => {}} options={["USD", "EUR", "GBP", "JPY", "CAD", "AUD"]} />
            <Select label="Number format" value="1,234.56" onChange={() => {}} options={["1,234.56", "1.234,56", "1 234.56"]} />
          </div>
        </Section>

        <Section title="AI Defaults" Icon={Sparkles}>
          <div className="space-y-3">
            <Select
              label="Default model"
              value={defaultModel}
              onChange={setDefaultModel}
              options={[
                "Claude Sonnet 4.6 (balanced)",
                "Claude Opus 4.7 (deep reasoning)",
                "Claude Haiku 4.5 (cheap + fast)",
              ]}
            />
            <Select
              label="Default automation mode"
              value={defaultMode}
              onChange={setDefaultMode}
              options={[
                "Auto with approval queue",
                "Fully autonomous",
                "Manual (you approve every action)",
              ]}
            />
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 text-[11px] text-ink-secondary">
              <Sparkles className="mb-1 h-3 w-3 text-brand-300 inline" />{" "}
              Cost-saver: cheap-tier (Haiku) is auto-used for filtering / classification regardless of the default above. Sonnet/Opus is reserved for negotiation, outreach, and reasoning.
            </div>
          </div>
        </Section>
      </div>

      <Section title="Appearance" Icon={Palette}>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-sm font-medium">Theme</div>
            <div className="text-[11px] text-ink-tertiary">
              Light / Dark / System. The choice persists across sessions and follows you between devices when signed in.
            </div>
          </div>
          <ThemeToggle variant="full" />
        </div>
      </Section>

      <Section title="Notifications" Icon={Bell}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { k: "deals", l: "Deal stage changes (closed-won, lost)", h: "Triggers within 60 seconds" },
            { k: "risk", l: "Risk Agent alerts", h: "Critical and High severity only" },
            { k: "weekly", l: "Weekly summary email", h: "Mondays 8am ET" },
            { k: "digest", l: "Daily digest of new opportunities", h: "Mornings 7am ET" },
            { k: "mentions", l: "Slack @mentions in approval queue", h: "Real-time" },
          ].map((opt) => (
            <label
              key={opt.k}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-bg-border bg-bg-hover/30 p-3"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{opt.l}</div>
                <div className="text-[11px] text-ink-tertiary">{opt.h}</div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setNotif({ ...notif, [opt.k]: !notif[opt.k as keyof typeof notif] });
                }}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  notif[opt.k as keyof typeof notif] ? "bg-gradient-brand" : "bg-bg-hover"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    notif[opt.k as keyof typeof notif] ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>
          ))}
        </div>
      </Section>

      <ApprovalPoliciesLink />

      <Section title="Security" Icon={Shield}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
            <div className="text-xs font-semibold">Two-factor auth</div>
            <div className="mt-0.5 text-[11px] text-accent-green">Enabled (TOTP)</div>
            <button className="mt-3 w-full rounded-md border border-bg-border bg-bg-card py-1.5 text-xs hover:bg-bg-hover">
              Reconfigure
            </button>
          </div>
          <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
            <div className="text-xs font-semibold">Active sessions</div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">2 devices</div>
            <button className="mt-3 w-full rounded-md border border-bg-border bg-bg-card py-1.5 text-xs hover:bg-bg-hover">
              View sessions
            </button>
          </div>
          <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
            <div className="text-xs font-semibold">Backup codes</div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">4 of 10 unused</div>
            <button className="mt-3 w-full rounded-md border border-bg-border bg-bg-card py-1.5 text-xs hover:bg-bg-hover">
              Regenerate
            </button>
          </div>
        </div>
      </Section>

      <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-5">
        <div className="text-sm font-semibold text-accent-red">Danger zone</div>
        <p className="mt-1 text-xs text-ink-secondary">
          These actions are irreversible. Workspace owners only.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/15">
            Export all data
          </button>
          <button className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/15">
            Transfer ownership
          </button>
          <button className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/15">
            Delete workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalPoliciesLink() {
  return (
    <Link
      href="/approvals"
      className="block rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-5 transition hover:border-brand-500/50 hover:shadow-glow"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-500/15">
          <ShieldCheck className="h-5 w-5 text-brand-300" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Approval policies</div>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Configure auto-approval rules and review high-stakes agent actions in the dedicated queue.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-brand-300" />
      </div>
    </Link>
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
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-brand-300" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none disabled:opacity-60"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
