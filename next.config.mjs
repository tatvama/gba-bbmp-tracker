/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // tesseract.js: WASM/worker assets. @napi-rs/canvas: native .node binary.
  // pdfjs-dist: ESM legacy build loaded via dynamic import at runtime. All three
  // must stay external so webpack doesn't try to bundle native/worker assets.
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas", "pdfjs-dist"],
  // Server Actions are enabled by default in Next 15.
  // Map provider/API keys intentionally omitted in v1 (placeholder only).
  eslint: {
    // Lint is run explicitly via `npm run lint`; don't fail production builds on it.
    ignoreDuringBuilds: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
