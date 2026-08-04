/**
 * Points git at the repo's checked-in hooks.
 *
 *   npm run hooks:install
 *
 * Runs automatically after `npm install` (the `prepare` script), so a fresh clone
 * gets changelog automation without anyone remembering — which is the point: the
 * changelog has to update whether a human or an AI agent is committing.
 *
 * Sets `core.hooksPath = .githooks` rather than copying files into `.git/hooks`.
 * `.git/hooks` is not version-controlled, so copies drift and nobody notices;
 * `core.hooksPath` means the hooks that run are the ones in the commit.
 *
 * Every failure is non-fatal. This must never break `npm install` — not in CI, not
 * in a Docker build (where there is no `.git` at all), not in a tarball checkout.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS_DIR = ".githooks";

function main() {
  // Docker builds copy the source without .git; CI usually does not want hooks.
  if (!existsSync(join(root, ".git"))) {
    console.log("· hooks: no .git directory — skipping");
    return;
  }
  if (process.env.CI) {
    console.log("· hooks: CI detected — skipping");
    return;
  }
  if (!existsSync(join(root, HOOKS_DIR))) {
    console.log(`· hooks: ${HOOKS_DIR}/ missing — skipping`);
    return;
  }

  const current = (() => {
    try {
      return execFileSync("git", ["config", "--get", "core.hooksPath"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
    } catch {
      return ""; // not configured
    }
  })();

  if (current === HOOKS_DIR) {
    console.log(`✓ hooks: core.hooksPath already ${HOOKS_DIR}`);
    return;
  }

  if (current && current !== HOOKS_DIR) {
    // Someone has their own hooks wired up deliberately — do not hijack it.
    console.log(
      `! hooks: core.hooksPath is "${current}", leaving it alone. ` +
        `Run \`git config core.hooksPath ${HOOKS_DIR}\` to enable changelog automation.`,
    );
    return;
  }

  try {
    execFileSync("git", ["config", "core.hooksPath", HOOKS_DIR], { cwd: root });
    console.log(`✓ hooks: core.hooksPath → ${HOOKS_DIR} (changelog auto-updates on commit)`);
  } catch (err) {
    console.log(
      "! hooks: could not set core.hooksPath —",
      err instanceof Error ? err.message : String(err),
    );
  }
}

main();
