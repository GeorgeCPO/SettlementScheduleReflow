# AGENTS.md

Settlement schedule reflow (TypeScript). Brief: dependencies, channel
conflicts, operating hours, blackout windows

## Commands

```bash
npm start                         # all scenarios
npm run scenario -- <id>          # one scenario (data/scenarios/<id>.json)
npm test                          # vitest (all)
npm run test:unit                 # unit tests only
npm run test:e2e                  # e2e scenario tests only (*.e2e.test.ts)
npm run typecheck                 # tsc (tests/start don't typecheck, so run this)
```

## Conventions

- Barebones: add a dependency, file or folder only when the current step needs it.
- No runtime input validation; scenario JSON is trusted to match `src/reflow/types.ts`.
- Relative imports use the `.ts` extension (tsx, no build step).
- Dates: ISO 8601 strings in UTC; use Luxon for date math.
- Don't invent types ahead of the code that needs them.

## Domain rules

- Regulatory holds never move. All `dependsOnTaskIds` must finish before a task starts.
- One task at a time per channel.

## Workflow

- Test-first: `tests/scenarios.e2e.test.ts` is the spec; expected results are also in
  each scenario's `description`.
- Log prompts in `prompts/NN-topic.md`.
