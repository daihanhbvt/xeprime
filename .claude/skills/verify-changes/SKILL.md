---
name: verify-changes
description: How to verify code you just changed — which commands to run and which to avoid. Load before running any build, lint, test, or typecheck command. Keeps verification scoped to the module that changed instead of sweeping the whole workspace.
---

# Verify only what you changed

Full-workspace `build`, `lint`, and `test` runs are slow and mostly re-check code nobody touched. Verify the change in front of you, not the whole monorepo. Fast, targeted feedback beats a green wall that took five minutes to paint.

## Rules

- **Never run a full build.** No workspace-wide `pnpm build` / `turbo build`.
- **Never run a full lint.** No workspace-wide `pnpm lint`.
- **Never run a full test.** No workspace-wide `pnpm test`.
- **Run only what verifies the code you just touched.** Scope every command to the affected package/module.
- **Prefer a narrow typecheck or the related module's test** — e.g. `pnpm --filter @xeprime/web typecheck`, or a single test file for the module you changed.
- **Ask before any long-running command.** If a check will take a while (full build/lint/test, container-backed concurrency tests, `pnpm install`, `pnpm contract`), stop and ask first.

## In practice

- Changed a web component/page → `pnpm --filter @xeprime/web typecheck` (plus the specific `*.test.tsx` if one covers it).
- Changed an api module/DTO → `pnpm --filter @xeprime/api typecheck`; run the affected Jest spec **by path**, not the whole suite.
- Changed a `packages/*` package → typecheck/test just that package.
- Touched the schema → apply the migration and re-run the seed; that IS the scoped verification here (see `database-change`). No full build needed.

When unsure whether a command is both necessary and cheap, ask before running it.
