import { redirect } from "next/navigation";

/**
 * /onboarding -> /onboarding/start
 *
 * Bare /onboarding is meaningless on its own (we don't know which
 * persona to render). Bounce to the chooser. Once a persona is
 * selected the chooser routes to /onboarding/<persona>.
 */
export default function OnboardingIndex() {
  redirect("/onboarding/start");
}
