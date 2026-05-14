"use client";
import OnboardingEngine from "@/components/onboarding/OnboardingEngine";
import { FLOWS } from "@/lib/onboarding";

/**
 * /onboarding/buyer — Buyer / Retailer setup track.
 * Slice 1 placeholder. Slice 4 fills in: products needed, industries,
 * monthly volume, regions, payment preferences, shipping requirements.
 */
export default function BuyerOnboardingPage() {
  return (
    <OnboardingEngine
      flow={FLOWS.buyer}
      title="Tell us what you source"
      blurb="We'll match you to verified suppliers and surface relevant trends."
    />
  );
}
