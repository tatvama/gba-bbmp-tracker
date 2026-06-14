/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server Actions are enabled by default in Next 15.
  // Map provider/API keys intentionally omitted in v1 (placeholder only).
  eslint: {
    // Lint is run explicitly via `npm run lint`; don't fail production builds on it.
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
