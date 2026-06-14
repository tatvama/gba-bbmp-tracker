# Claude memory — GBA / BBMP Ward & Engineer Tracker

This folder is a snapshot of the project's **Claude Code memory** — the durable
context an AI assistant uses to work on this codebase effectively. It is checked
in so the knowledge travels with the repo and any teammate (or a fresh Claude
session) starts with the same understanding.

Start with **[MEMORY.md](./MEMORY.md)** — the index. Each linked note captures a
slice of the project's architecture, decisions, and hard-won gotchas:

| File | What it covers |
|------|----------------|
| `MEMORY.md` | Index of all notes + the GitHub repo link |
| `bbmp-stack-override.md` | Why it's Supabase-native (not Prisma/local PG) |
| `bbmp-data-model-facts.md` | Seed counts, AC→corp derivation, 369-ward data, OCR of the scanned PDFs |
| `bbmp-ui-preferences.md` | Nav, search-first UX, Tree Map explorer |
| `bbmp-phase2-rti.md` | RTI module — migration 0003, deadline engine, AI wrapper |
| `bbmp-phase3-complaints.md` | Complaint mgmt — migration 0004, OCR, AI extraction, Storage, soft-delete |
| `bbmp-design-system.md` | CSS/component rework — button/card/badge/table/input/tabs/sidebar |
| `bbmp-mcp-and-road-work.md` | MCP server (16 tools) + road-work letter generator + 4 accountability features |

> These are working notes, not formal docs. The authoritative reference for
> setup and usage is the top-level [`README.md`](../../README.md).
