"use client";
import OnboardingEngine from "@/components/onboarding/OnboardingEngine";
import { FLOWS } from "@/lib/onboarding";

/**
 * /onboarding/admin — Platform-owner setup track.
 * Slice 1 placeholder. Slice 2 fills in the question bank
 * (org structure, billing intent, AI defaults, outreach approval,
 * compliance toggle, integrations).
 */
export default function AdminOnboardingPage() {
  return (
    <OnboardingEngine
      flow={FLOWS.admin}
      title="Set up your workspace"
      blurb="A few questions and AVYN will be ready to run your operation."
    />
  );
}
