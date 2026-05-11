import { redirect } from "next/navigation";

// AVYN is single-tenant + token-only. The /signin route is the real auth
// entry point; /login historically rendered a fake email+password form
// that just redirected to "/" without authenticating. Permanent redirect
// preserves any external links.

export default function LoginRedirect() {
  redirect("/signin");
}
