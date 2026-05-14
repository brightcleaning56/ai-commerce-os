"use client";
import OnboardingEngine from "@/components/onboarding/OnboardingEngine";
import { FLOWS } from "@/lib/onboarding";

/**
 * /onboarding/distributor — Distributor / Logistics setup track.
 * Slice 1 placeholder. Slice 6 fills in: regions served, freight
 * methods, warehouse network, trucking/shipping capabilities,
 * delivery timelines.
 */
export default function DistributorOnboardingPage() {
  return (
    <OnboardingEngine
      flow={FLOWS.distributor}
      title="Join AVYN's distribution network"
      blurb="Help us route the right freight to the right lanes."
    />
  );
}
