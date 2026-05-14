"use client";
import OnboardingEngine from "@/components/onboarding/OnboardingEngine";
import { FLOWS } from "@/lib/onboarding";

/**
 * /onboarding/team — Team-member setup track.
 * Slice 1 placeholder. Slice 3 fills in: department, assigned
 * workflows, AI agent access, approval limits, communication scope.
 *
 * Note: invited users come in via /invite/[token] which does role
 * assignment + token mint. This flow extends that with
 * department + workflow + access preferences once they're inside.
 */
export default function TeamOnboardingPage() {
  return (
    <OnboardingEngine
      flow={FLOWS.team}
      title="Welcome to the team"
      blurb="Tell us how you want to work and we'll wire up the right access."
    />
  );
}
