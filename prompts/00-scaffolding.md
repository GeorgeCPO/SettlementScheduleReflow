# 00 — Project scaffolding

## Prompt

> Here are the requirements for the project (Settlement Schedule Reflow technical test PDF).
> Let's start by planning the scaffolding of the project.

## Outcome / decisions

- **Stack:** TypeScript (strict, ESM), `tsx` to run without a build step, `vitest` for tests, `luxon` for dates.
- **Dropped:** `zod` input validation (not required by the brief), and Prettier. The algorithm still throws
  meaningful errors for broken references (unknown task/channel) and dependency cycles.
- **Versions:** latest releases, pinned exactly (`--save-exact`); Node 24 LTS (`engines`).