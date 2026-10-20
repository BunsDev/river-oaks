# Goal prompts

Long-running prompts for an agent session (`/goal`), one per file. Each one records the
project's state at the time it was written: its snapshot sections (main health, owners, ports,
counts) go stale within hours. A session that runs one checks every snapshot claim against the
live register, `origin/main` and GitHub before acting on it, and the prompt tells it how.

| Prompt | Written | Lane |
| --- | --- | --- |
| [2026-10-20-overnight-steward](2026-10-20-overnight-steward.md) | 2026-10-20 04:45Z | Overnight steward: main health, register reconciliation, unowned lanes |
| [2026-10-19-resilient-client-290](2026-10-19-resilient-client-290.md) | 2026-10-19 | Resilient client: graphics loss, backgrounding and network changes (#290 web side, #288 touch-hold) |
