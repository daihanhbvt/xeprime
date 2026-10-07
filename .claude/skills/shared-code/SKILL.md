---
name: shared-code
description: Deciding where a piece of logic, type, constant, or component should live — and whether something being written inline should instead be extracted and reused. Load when you notice a value, transform, or pattern appearing more than once, or when adding something that crosses the web/native/api boundary. The discipline that keeps the codebase DRY, common-first, and free of hardcoding.
---

# Common-first: where code lives, and when to extract

The difference between a codebase that ages well and one that rots is almost entirely about where things live. A senior engineer is not someone who writes clever code; it is someone who, on seeing the same idea appear a second time, pulls it into one place before it appears a fifth. This skill is that instinct made explicit.

## The reflex

When you are about to write logic that formats, maps, validates, or transforms — pause and ask two questions in order:

1. **Does this already exist?** Look before you write. A displayed value, a code-to-label mapping, a date or amount rendering, a shared shape — these usually already have a home. Reusing it keeps behaviour consistent everywhere and means a fix lands once.
2. **If it does not exist yet, does it belong in a shared place rather than inline?** Anything that could plausibly recur — presentation of a domain value, a piece of validation, a mapping, a guard clause — is shared-shaped. Writing it inline in the one place you need it today is borrowing against every place that will need it tomorrow. The established helper layers show the standard: small, single-purpose, well-named functions that own one transformation so no component has to.

The goal is not maximum abstraction. It is *one source of truth per concept*. A value that is correct in one file and subtly different in another is worse than either; centralising it removes the possibility of drift.

## Where things belong

- **`packages/types`** — anything web, native and api must agree on: status unions and their `*_META` maps, roles, permissions, error codes, the generated API types (`api.generated.ts`), shared domain shapes. If two sides could disagree about it, it belongs here so they cannot.
- **`packages/domain`** — framework-free business logic shared by web, native and api: money on strings, time zone + rental duration, busy calendar, pickup preference, VietQR, address/geo helpers — plus the one message source for i18n (`packages/domain/messages/{vi,en}`). Metro reads it, so it never imports `next/*`, `antd`, React UI, DOM APIs, `File`, CSS, or `process.env`.
- **`packages/validators`** — Yup schemas shared across forms (web and native).
- **`packages/api-client`** — HTTP infrastructure only: client, `{data, meta}` envelope, pagination, `ApiClientError`, `AuthTransport`, `queryKeys`. Endpoint paths and feature calls do **not** go here (ADR 0031) — same import ban as `domain`.
- **`packages/ui`** — design tokens (`XP_TOKENS`, `tokens.css`) shared web + native with a platform-free root export, and a component genuinely used by more than one app surface. A component used in exactly one place stays there; promote it only when the second real consumer appears.
- **`apps/web/src/lib`** — web-only helpers (CSS class joining, query client, UI preferences, map loading…). Its `money.ts`/`datetime.ts`/`long-term.ts` are re-export shims of `@xeprime/domain`: extend the domain package, not the shim.
- **`apps/web/src/components`, `hooks`, `services`, `constants`** — reusable pieces scoped to the web app. `features/<feature>/api.ts` holds that feature's API calls.
- **A backend service** — logic that owns a table's writes or a business operation. Cross-cutting request behaviour (auth, realm, scope, errors, response shape) belongs in `apps/api/src/common`, not copied into each module.

The feature API layer is deliberately **one copy per app** (ADR 0031): web in `apps/web/src/features/<feature>/api.ts`, native in `apps/mobile/shared/src/api/<feature>/`. They do not sync themselves — a change to a shared contract has to land in both. If the other copy is not yours to edit, say so explicitly in your report rather than leaving it silently stale.

## Judgment, not dogma

Extract on the second occurrence, not in anticipation of the first — a single use with a speculative abstraction around it is its own kind of debt. But do not let "it's only used once" excuse inlining something that is obviously a reusable primitive; a formatter, a mapper, or a validator is reusable by nature even at its first use, and belongs in the shared layer from the start. The test is whether the *concept* is shared, not whether the *call sites* are yet.

When you promote something, promote it cleanly: a clear name, a single responsibility, no leftover duplicate at the old site, and — if it crosses the web/native/api line — into `packages/*` so every side consumes the one definition. Leaving the inline copy behind "just in case" recreates the drift you were removing.

## The tell

If you ever find yourself typing a domain string literal, a magic number, a hex colour, or a formatting expression a second time, that is the signal. Stop, find or create the shared home, and route both sites through it. The reviewer will look for exactly this; get there first.
