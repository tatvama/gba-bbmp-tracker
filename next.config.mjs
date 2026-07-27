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
  //
  // nodemailer: needs Node builtins (net, tls, dns, crypto, fs, stream, os,
  // child_process) that the bundler can't polyfill/trace correctly for every
  // consumer. The original letter-email feature never hit this because it's
  // only ever reached from request-triggered code (a "use server" action ->
  // the job-handler registry), which Next bundles normally. The overdue-alert
  // sweeper (lib/complaints/overdue-alert-scheduler.ts) is reached from
  // lib/startup/jobs.ts, which instrumentation.ts loads under the same
  // "more restrictive resolution rules" instrumentation.ts's own top comment
  // describes — there, a static `import nodemailer from "nodemailer"` failed
  // with "Module not found: Can't resolve 'stream'" (and 'net'/'tls'/'dns'/…
  // once nodemailer's SMTP transport itself was reached, not just its unused
  // SES-transport branch). Externalizing fixes both call sites at once.
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas", "pdfjs-dist", "pg", "sharp", "puppeteer", "nodemailer"],
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
  // Re-disabled after re-enabling it caused ~3.7GB dev-server memory usage on
  // this machine (15.4GB total RAM, ~4.5GB free) and made the whole system feel
  // slower, not just the app — the persistent filesystem cache trades a heavier
  // long-running process for faster incremental rebuilds, which is the wrong
  // trade on a memory-constrained box. Revisit only if this machine gets more
  // RAM or the project moves to a beefier dev environment.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
