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
- **Ask before any long-running command.** If a check will take a while (full build/lint/test, container-backed concurrency tests, `pnpm install`), stop and ask first. `pnpm contract` is the exception: when the API's request/response surface changed it is part of finishing the work, not an optional check — say you are running it, then run it.

## In practice

- Changed a web component/page → `pnpm --filter @xeprime/web typecheck` (plus the specific `*.test.tsx` if one covers it).
- Changed an api module/DTO → `pnpm --filter @xeprime/api typecheck`; run the affected Jest spec **by path**, not the whole suite.
- Changed an api controller, DTO, guard, or permission → you also changed the published API docs and the web's generated types. Run `pnpm contract`, commit the regenerated `packages/types/openapi.json` and `packages/types/src/api.generated.ts`, then `pnpm --filter @xeprime/api test -- openapi-contract` (seconds, no database) — it fails if the committed spec drifted or a route is missing its tag, summary, or response type. See `docs/api-docs.md`.
- Changed a `packages/*` package → typecheck/test just that package.
- Touched the schema → apply the migration and re-run the seed; that IS the scoped verification here (see `database-change`). No full build needed.
- Touched `messages/**` or added `t(...)` keys → `pnpm --filter @xeprime/web i18n:check` (fast, and the only thing that catches an `en` gap), then `i18n:audit` to confirm the area you converted is gone (see `i18n`).

When unsure whether a command is both necessary and cheap, ask before running it.
