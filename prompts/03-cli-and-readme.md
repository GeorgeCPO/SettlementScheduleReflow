# 03 — CLI entry point and README

## Prompts

> Make the entry point useful for the demo: `npm start` runs every scenario, and a separate script runs a single
> scenario picked by name. An unknown name should fail with a clear message listing what's available.

> Add a README that explains how to use the project.

> Too long. Keep it to what someone needs to get it running — install, run, test — and nothing more.

## Outcome / decisions

- `npm run scenario -- <id>` runs one scenario (id = JSON file name, `.json` optional); `npm start` runs them all.
- New scenario files in `data/scenarios/` are picked up automatically, no code changes needed.
- Unknown ids print the available scenarios and exit with code 1.
- README kept minimal: requirements, the four commands, where scenarios live. The algorithm write-up comes later.
