# Changelog automation

[`CHANGELOG.md`](CHANGELOG.md) maintains itself. Nobody writes entries, and nobody
has to remember to — **including an AI agent.**

The guarantee: every commit ends up carrying its own changelog entry, inside that
same commit. No follow-up commit, no dirty working tree, no separate release step.

---

## How it works

```
git commit -m "feat(rti): add second-appeal reminder"
        │
        ▼
commit created
        │
        ▼
.githooks/post-commit
        │
        ├─▶ scripts/update-changelog.ts
        │        rebuilds CHANGELOG.md from `git log` (the new commit is in it)
        │
        └─▶ git add CHANGELOG.md
            CHANGELOG_SKIP=1 git commit --amend --no-edit --no-verify
        │
        ▼
one commit, changelog included
```

| File | Role |
|---|---|
| [`scripts/update-changelog.ts`](scripts/update-changelog.ts) | Rebuilds `CHANGELOG.md` from `git log`. Also runnable by hand |
| [`.githooks/post-commit`](.githooks/post-commit) | Regenerates after each commit and folds it in |
| [`scripts/install-hooks.ts`](scripts/install-hooks.ts) | Points git at `.githooks/` |

### Why `post-commit` and not `prepare-commit-msg`

`prepare-commit-msg` is the intuitive choice — the message exists there, and the
tree has supposedly not been written yet, so `git add CHANGELOG.md` ought to land in
the commit.

**It does not.** Git snapshots the index *before* running that hook, so the add
applies to the index but not to the commit being created. Measured here on git 2.x:
the changelog ended up staged for the *next* commit, while the commit that
introduced it did not contain it. `pre-commit` stages reliably — that is how
lint-staged works — but it runs before the message exists, so it cannot describe the
change.

`post-commit` runs once `HEAD` exists. That is strictly better in one way: the
generator reads the **real commit** out of `git log` instead of guessing at a
pending message file. The changelog is then folded in with `--amend`.

Amending is safe here because the commit has not been pushed yet — it is a local
rewrite of a commit that is seconds old. `CHANGELOG_SKIP=1` on the amend is what
stops the hook re-entering itself, since `--no-verify` does **not** skip
`post-commit`.

### Why full regeneration instead of appending

The generator rebuilds the entire file every run, which makes it **idempotent**:
running it twice, or in the hook and again later, produces byte-identical output. An
appending script would duplicate entries the first time a hook fired twice or a
rebase replayed a commit, and nothing would reveal it.

The output carries **no commit hashes**, because the hook amends the very commit it
just read — embedding the hash would change the hash, and the file could never
describe itself consistently. `git log` stays the tool for tracing; `CHANGELOG.md`
is for reading.

---

## Setup

Automatic — `npm install` runs it via the `prepare` script. Explicitly:

```bash
npm run hooks:install
```

That sets `core.hooksPath = .githooks`. Files are not copied into `.git/hooks`,
because that directory is not version-controlled and copies drift silently; this way
the hooks that run are the ones in the commit.

It is deliberately non-fatal and skips when there is no `.git` (Docker builds), when
`CI` is set, or when you already have your own `core.hooksPath` — it will not hijack
an existing setup.

Verify:

```bash
git config --get core.hooksPath     # → .githooks
```

---

## Commit message → changelog section

Entries come from [Conventional Commits](https://www.conventionalcommits.org/)
subjects: `type(scope): subject`.

| Commit type | Section |
|---|---|
| `feat` | Features |
| `fix` | Fixes |
| `perf` | Performance |
| `style`, `ux` | UI & UX |
| `data` | Data |
| `refactor` | Refactoring |
| `scripts`, `build`, `ci`, `tooling` | Scripts & tooling |
| `docs` | Documentation |
| `test` | Tests |
| `chore`, `wip`, `revert` | Chores |
| anything else | Other |

`style` is filed under **UI & UX**, not code formatting, because that is how this
repo has always used it (32 commits of visible UI work).

A `!` before the colon — `feat(api)!: drop v1 routes` — or a `BREAKING CHANGE:` line
in the body promotes the entry to a **⚠ Breaking changes** block at the top of that
day.

An unparseable subject is not dropped; it goes to **Other**. The 38 commits that
predate the convention are all still there.

Entries group by **date**, newest first. There are no release tags in this repo and
the app deploys continuously, so dates are the honest unit. If you start tagging
releases, group by tag in `render()` instead.

Merge commits are excluded — `Merge pull request #9 from …` says nothing about what
changed, and the merged commits are already listed.

---

## Everyday use

Nothing to do. Write a good commit subject; that subject *is* the changelog entry.

```bash
npm run changelog            # regenerate by hand
npm run changelog -- --check # exit 1 if stale — for CI
```

`--check` is useful as a CI guard to prove nobody hand-edited the file or committed
with hooks disabled.

### Skipping it once

```bash
CHANGELOG_SKIP=1 git commit -m "chore: something invisible"
```

### When it deliberately does nothing

| Situation | Why |
|---|---|
| `CHANGELOG_SKIP=1` | Escape hatch, and the hook's own recursion guard |
| Merge commits | No subject worth logging, and amending a merge is a bad idea |
| Mid rebase / merge / cherry-pick | Amending would rewrite the wrong commit |
| **Other changes are staged** | `git commit -- <path>` leaves staged work behind; amending would silently absorb it. The hook warns and leaves the commit alone |
| Changelog already current | Nothing to fold in |
| `tsx` unavailable | Warns and exits |

**The hook can never break a commit.** Every path exits 0. In the two cases where it
bails after generating (staged work present, amend failed), it says so on stderr and
`CHANGELOG.md` is left updated on disk for you to commit.

---

## Do not hand-edit `CHANGELOG.md`

It is regenerated from git history on the next commit, so manual edits are silently
overwritten. To change how an entry reads, change the commit message (`git commit
--amend` for the last one, then `npm run changelog`).

---

## For AI agents

If you are an agent working in this repo:

- **Do not edit `CHANGELOG.md`**, and do not add "update the changelog" steps to a
  plan. It is generated.
- **Do not write changelog prose into commit message bodies.** The subject line
  becomes the entry.
- Use conventional-commit subjects — `type(scope): imperative summary` — because the
  section an entry lands in is derived from `type`.
- Expect the commit you just made to be **amended** by the hook; its hash will
  change. Do not treat that as an error, and do not record a hash before committing.
- If a commit must stay out of the changelog, use `CHANGELOG_SKIP=1`.
- Committing normally is enough; the hook handles the rest.
