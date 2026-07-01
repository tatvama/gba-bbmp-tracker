// Vitest alias target for the `server-only` marker package (see vitest.config.ts).
// Next.js resolves `server-only` via its own build pipeline; it isn't a real
// npm package under plain Node/Vite, so files that `import "server-only"`
// can't be imported directly in tests without this no-op stub. Test-tooling
// only — does not affect the Next.js production build in any way.
export {};
