/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We run tsc --noEmit and eslint separately in CI / pre-deploy.
  // Don't double-fail builds on lint warnings.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};
module.exports = nextConfig;
