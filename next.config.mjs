/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // tesseract.js: WASM/worker assets. @napi-rs/canvas + sharp: native .node
  // binaries. pdfjs-dist: ESM legacy build loaded via dynamic import at
  // runtime. puppeteer: launches system Chromium (see Dockerfile), not meant
  // to be traced/bundled. All must stay external so webpack doesn't try to
  // bundle native/worker assets — un-externalized native-binding packages get
  // traced into every route that touches them, which is a well-documented
  // contributor to Docker build OOM kills during "Creating an optimized
  // production build" (the exact point this app's deploy was dying at, with
  // no error message — consistent with the OS killing the process outright
  // rather than a catchable build error).
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas", "pdfjs-dist", "pg", "sharp", "puppeteer"],
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
