# 12 — README for reviewers

## Prompts

> Expand the README so a reviewer can understand the solution, not just run it. Keep the install/run/test part and
>
> - Approach: the steps of `ReflowService.reflow` in order (book the holds, sort by dependency, place each task in
>   the first free slot while its channel is open, check settlement deadlines). Say that tasks only move later and
>   that a paused task keeps its whole span on the channel. Walk through the brief's Mon 15:00 → Tue 09:00 example.
> - Output: what `updatedTasks`, `changes` and `explanation` contain
> - Assumptions and errors: the UTC and operating-hours rules, and every case where the reflow throws.
> - Trade-offs: based on the `@upgrade` comments, plus what isn't built yet.
> - Project layout: a short file tree.
> - AI usage: point to `prompts/`.
>
> Only describe what the code does today, and check each claim against the source. Keep it short and scannable.

## Outcome / decisions

- Prep time was already built, so it's described in Approach and not listed as unbuilt. Metrics and an independent
  constraint checker are the only unbuilt items.
- "Tasks only move later" is stated for starts. End dates are recalculated from working minutes, and the input
  `endDate` is ignored (noted under Assumptions).
- Errors also cover cases found in the code: a self-dependency counts as a cycle, a channel with no operating hours
  throws, and one deadline error lists every breach.
- The output excerpt is a real `changes` entry from scenario 02 and real `npm start` lines from scenario 03.
- The placement step describes the slot search in plain language rather than code.
