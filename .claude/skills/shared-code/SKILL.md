---
name: shared-code
description: Deciding where a piece of logic, type, constant, or component should live — and whether something being written inline should instead be extracted and reused. Load when you notice a value, transform, or pattern appearing more than once, or when adding something that crosses the web/api boundary. The discipline that keeps the codebase DRY, common-first, and free of hardcoding.
---

# Common-first: where code lives, and when to extract

The difference between a codebase that ages well and one that rots is almost entirely about where things live. A senior engineer is not someone who writes clever code; it is someone who, on seeing the same idea appear a second time, pulls it into one place before it appears a fifth. This skill is that instinct made explicit.

## The reflex

When you are about to write logic that formats, maps, validates, or transforms — pause and ask two questions in order:

1. **Does this already exist?** Look before you write. A displayed value, a code-to-label mapping, a date or amount rendering, a shared shape — these usually already have a home. Reusing it keeps behaviour consistent everywhere and means a fix lands once.
2. **If it does not exist yet, does it belong in a shared place rather than inline?** Anything that could plausibly recur — presentation of a domain value, a piece of validation, a mapping, a guard clause — is shared-shaped. Writing it inline in the one place you need it today is borrowing against every place that will need it tomorrow. The established helper layers show the standard: small, single-purpose, well-named functions that own one transformation so no component has to.

The goal is not maximum abstraction. It is *one source of truth per concept*. A value that is correct in one file and subtly different in another is worse than either; centralising it removes the possibility of drift.

## Where things belong

- **`packages/types`** — anything both the web and api sides must agree on: status unions, roles, permissions, the response/error contract, shared domain shapes. If the frontend and backend could disagree about it, it belongs here so they cannot.
- **`packages/validators`** — validation schemas shared across forms.
- **`packages/ui`** — a component genuinely used by more than one app surface. A component used in exactly one place stays there; promote it only when the second real consumer appears.
- **`apps/web/src/lib`** — framework-agnostic web helpers: formatting, date/time, small pure utilities. The place presentation and transformation logic goes so components stay declarative.
- **`apps/web/src/components`, `hooks`, `services`, `constants`** — reusable pieces scoped to the web app.
- **A backend service** — logic that owns a table's writes or a business operation. Cross-cutting request behaviour (auth, scope, errors, response shape) belongs in `apps/api/src/common`, not copied into each module.

## Judgment, not dogma

Extract on the second occurrence, not in anticipation of the first — a single use with a speculative abstraction around it is its own kind of debt. But do not let "it's only used once" excuse inlining something that is obviously a reusable primitive; a formatter, a mapper, or a validator is reusable by nature even at its first use, and belongs in the shared layer from the start. The test is whether the *concept* is shared, not whether the *call sites* are yet.

When you promote something, promote it cleanly: a clear name, a single responsibility, no leftover duplicate at the old site, and — if it crosses the web/api line — into `packages/*` so both sides consume the one definition. Leaving the inline copy behind "just in case" recreates the drift you were removing.

## The tell

If you ever find yourself typing a domain string literal, a magic number, a hex colour, or a formatting expression a second time, that is the signal. Stop, find or create the shared home, and route both sites through it. The reviewer will look for exactly this; get there first.
