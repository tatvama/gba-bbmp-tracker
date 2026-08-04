# Workspace Rules

- Do not proceed directly with execution of an implementation plan even if there is an automatic review/approval policy. Always wait for the user's explicit manual confirmation or input in the chat before starting execution.

## Changelog — generated, never hand-written

`CHANGELOG.md` is generated from git history by `scripts/update-changelog.ts`, which
`.githooks/post-commit` runs after every commit, folding the result into that commit
with `--amend`. Full detail: [`CHANGELOG_AUTOMATION.md`](../CHANGELOG_AUTOMATION.md).

- **Never edit `CHANGELOG.md`**, and never add a "update the changelog" step to a
  plan or todo list. It is rebuilt on the next commit, so edits are silently lost.
- **Never write changelog prose into a commit message body.** The subject line *is*
  the changelog entry.
- Use conventional-commit subjects — `type(scope): imperative summary`. The section
  an entry lands in is derived from `type` (`feat`, `fix`, `perf`, `style`/`ux`,
  `data`, `refactor`, `scripts`, `docs`, `test`, `chore`). A `!` before the colon
  marks a breaking change.
- Expect the commit you just made to be **amended** by the hook, so its hash
  changes. That is normal — do not treat it as an error, and do not record a commit
  hash before committing.
- To keep a commit out of the changelog: `CHANGELOG_SKIP=1 git commit -m "…"`.
- Committing normally is all that is required.

## Project memory

Durable context lives in `.claude/memory/`, indexed by
[`MEMORY.md`](../.claude/memory/MEMORY.md). Read the index before starting
non-trivial work — it records decisions and gotchas that are not derivable from the
code, and add a note there when you learn something that would cost the next
session time.
