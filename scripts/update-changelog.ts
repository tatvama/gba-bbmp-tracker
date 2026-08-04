/**
 * Regenerates CHANGELOG.md from git history.
 *
 *   npm run changelog             # rewrite CHANGELOG.md from git log
 *   npm run changelog -- --check  # exit 1 if it is out of date (no write)
 *
 * Normally you never run this by hand: .githooks/post-commit calls it after every
 * commit and folds the result into that same commit, so the changelog travels with
 * the change it describes. That is what makes it work identically whether a human
 * or an AI agent is committing — neither has to remember. See
 * CHANGELOG_AUTOMATION.md.
 *
 * FULL REGENERATION, NOT APPEND. The whole file is rebuilt from `git log` every
 * time, which makes the script idempotent: running it twice, or running it inside
 * the hook and again later, produces byte-identical output. An appending script
 * would double entries the moment a hook fired twice or a rebase replayed a
 * commit, and there would be no way to tell.
 *
 * Deliberately NO commit hashes in the output. The hook amends the commit it just
 * read, so embedding its hash would change the hash and the file could never
 * describe itself consistently. `git log` remains the tool for tracing; this file
 * is for reading.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "CHANGELOG.md");

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");

/** Field/record separators — chosen because they cannot occur in a commit message. */
const FS = "\x1f";
const RS = "\x1e";

/**
 * Commit `type` → section heading. Order here is the order sections appear, i.e.
 * roughly "what a reader cares about most" first.
 *
 * `style` and `ux` are folded together: in this repo's history `style:` is used
 * for visible UI work (32 commits), not code formatting, so filing it under
 * "UI & UX" describes it honestly. `wip` joins Chores rather than getting its own
 * heading, which would advertise unfinished work as a category.
 */
const SECTIONS: Array<{ heading: string; types: string[] }> = [
  { heading: "Features", types: ["feat"] },
  { heading: "Fixes", types: ["fix"] },
  { heading: "Performance", types: ["perf"] },
  { heading: "UI & UX", types: ["style", "ux"] },
  { heading: "Data", types: ["data"] },
  { heading: "Refactoring", types: ["refactor"] },
  { heading: "Scripts & tooling", types: ["scripts", "build", "ci", "tooling"] },
  { heading: "Documentation", types: ["docs"] },
  { heading: "Tests", types: ["test", "tests"] },
  { heading: "Chores", types: ["chore", "wip", "revert"] },
  // Anything unrecognised — 38 commits predate the convention. Dropping them
  // would silently lose real history, so they get a bucket instead.
  { heading: "Other", types: ["__other__"] },
];

const TYPE_TO_HEADING = new Map<string, string>();
for (const s of SECTIONS) for (const t of s.types) TYPE_TO_HEADING.set(t, s.heading);

interface Entry {
  date: string;
  type: string;
  scope: string | null;
  subject: string;
  breaking: boolean;
}

/** `type(scope)!: subject` — tolerant, and falls back to the raw subject. */
function parseSubject(raw: string): Omit<Entry, "date"> {
  const m = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(raw.trim());
  if (!m) {
    return { type: "__other__", scope: null, subject: raw.trim(), breaking: false };
  }
  const [, type, scope, bang, subject] = m;
  const normalisedType = type!.toLowerCase();
  return {
    type: TYPE_TO_HEADING.has(normalisedType) ? normalisedType : "__other__",
    scope: scope?.trim() || null,
    subject: subject!.trim(),
    breaking: bang === "!",
  };
}

function gitLog(): Entry[] {
  // --no-merges: a merge commit's subject ("Merge pull request #9 from …") says
  // nothing about what changed; the merged commits themselves are already listed.
  const out = execFileSync(
    "git",
    [
      "log",
      "--no-merges",
      "--date=short",
      `--pretty=format:%ad${FS}%s${FS}%b${RS}`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  return out
    .split(RS)
    .map((rec) => rec.replace(/^\s+/, ""))
    .filter(Boolean)
    .map((rec) => {
      const [date = "", subject = "", body = ""] = rec.split(FS);
      const parsed = parseSubject(subject);
      return {
        date,
        ...parsed,
        breaking: parsed.breaking || /^BREAKING[ -]CHANGE:/m.test(body),
      };
    });
}

function render(entries: Entry[]): string {
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const dates = [...byDate.keys()].sort().reverse();

  const lines: string[] = [
    "# Changelog",
    "",
    "All notable changes to this project, newest first.",
    "",
    "**This file is generated — do not edit it by hand.** It is rebuilt from the git",
    "history by `scripts/update-changelog.ts`, which runs automatically after every",
    "commit via `.githooks/post-commit`. Edits here are overwritten by the next",
    "commit; change the commit message instead. See",
    "[CHANGELOG_AUTOMATION.md](CHANGELOG_AUTOMATION.md).",
    "",
    "Entries are grouped by date and derived from",
    "[Conventional Commits](https://www.conventionalcommits.org/) subjects.",
    "",
  ];

  for (const date of dates) {
    const dayEntries = byDate.get(date)!;
    lines.push(`## ${date}`, "");

    const breaking = dayEntries.filter((e) => e.breaking);
    if (breaking.length > 0) {
      lines.push("### ⚠ Breaking changes", "");
      for (const e of breaking) lines.push(formatEntry(e));
      lines.push("");
    }

    for (const section of SECTIONS) {
      const matched = dayEntries.filter(
        (e) => !e.breaking && section.types.includes(e.type),
      );
      if (matched.length === 0) continue;
      lines.push(`### ${section.heading}`, "");
      for (const e of matched) lines.push(formatEntry(e));
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function formatEntry(e: Entry): string {
  const scope = e.scope ? `**${e.scope}:** ` : "";
  return `- ${scope}${e.subject}`;
}

/**
 * Compare on content, not bytes. We always WRITE lf, but a checkout under
 * `core.autocrlf=true` (this repo's setting) leaves crlf on disk, so a byte
 * comparison reports every line as changed and `--check` fails on a clean clone.
 * .gitattributes pins CHANGELOG.md to lf as the real fix; this keeps the script
 * honest for anyone whose git is configured differently.
 */
function sameContent(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
}

function main() {
  const entries = gitLog();
  const next = render(entries);
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

  if (CHECK_ONLY) {
    if (sameContent(current, next)) {
      console.log("✓ CHANGELOG.md is up to date");
      return;
    }
    console.error("✗ CHANGELOG.md is out of date — run `npm run changelog`");
    process.exit(1);
  }

  if (sameContent(current, next)) {
    console.log(`✓ CHANGELOG.md already current (${entries.length} commits)`);
    return;
  }

  writeFileSync(OUT, next, "utf8");
  console.log(`✓ CHANGELOG.md written — ${entries.length} commits`);
}

main();
