"use client";
import OnboardingEngine from "@/components/onboarding/OnboardingEngine";
import { FLOWS } from "@/lib/onboarding";

/**
 * /onboarding/supplier — Supplier / Manufacturer setup track.
 * Slice 1 placeholder. Slice 5 fills in: certifications, manufacturing
 * capabilities, MOQ, warehouse locations, shipping methods, capacity,
 * distribution regions, plus dynamic industry sub-questions
 * (Agriculture -> crops/seasons; Apparel -> categories; etc.)
 *
 * Will replace /portal/signup once slice 5 lands.
 */
export default function SupplierOnboardingPage() {
  return (
    <OnboardingEngine
      flow={FLOWS.supplier}
      title="Join the verified-supplier network"
      blurb="The more we know, the better the buyer matches we surface."
    />
  );
}
