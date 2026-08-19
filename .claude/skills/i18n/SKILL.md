---
name: i18n
description: Any user-facing text in apps/web — a new screen, a label, a toast, a validation message, an empty/error state, a chart axis, an email-like copy block — plus adding an API error code in apps/api that the web must show. Load before writing that text so it ships in both vi and en, and so a screen you touch that is still hardcoded Vietnamese gets converted instead of extended.
---

# Every screen ships bilingual — and you convert what you touch

The i18n machinery is finished (ADR 0012): one URL for both languages, locale in the `XP_LOCALE` cookie read server-side, `next-intl` with no locale routing, message bundles, formatters, domain labels, error-code mapping, two CI gates. What is *not* finished is coverage — `pnpm --filter @xeprime/web i18n:audit` still names ~3.5k raw Vietnamese strings across the manage portal and later features. That is the backlog you are working against, and the one rule that keeps it shrinking instead of growing:

**No new hardcoded UI string, ever. And when you open a file that still has them, convert that file as part of your change.**

A feature added in raw Vietnamese is not "translate later" — it is a second copy of the same debt, written by someone who had the file open and walked past it.

## Before writing text

Look for the string first. `Common` holds the genuinely shared vocabulary — `actions.save`, `actions.cancel`, `states.loading`, `states.empty`, `states.error` — and copying "Lưu" into your feature's bundle is the same mistake as copying a helper. Business values (status, role, service type, vehicle type, pickup preference) are never authored as text at all: they render through `useDomainLabel()` / `getAppFormat()` against the `Domain` namespace. Money, dates, durations, distances go through `useAppFormat()` (client) or `getAppFormat()` (server) — never `toLocaleString` at the call site, never `dayjs.locale(...)` anywhere (it mutates process-global state and leaks language between concurrent SSR requests).

Only text genuinely owned by your feature goes in your feature's namespace.

## Converting a screen — the whole loop

1. **Namespace** — one per feature, by ownership, not by screen. Reuse the existing one if the feature has it (`src/i18n/namespaces.ts` is the list). A new one means: add the entry there, create `messages/vi/<file>.json` **and** `messages/en/<file>.json`, and register it in **both** `messages/vi/index.ts` and `messages/en/index.ts`. All five edits or `i18n:check` fails — and an empty namespace is rejected on purpose, because an empty file is a false claim that the area is done.
2. **Move the Vietnamese out of the code, verbatim**, into `messages/vi/*.json` under nested keys that mirror the UI (`page.title`, `tabs.needsAction`, `form.errors.required`). Then write the English. Plurals and interpolation are ICU: `"{count, plural, other {# yêu cầu}}"`, same variable names in both languages.
3. **Wire the component** — `useTranslations('Feature')` in a client component, `getTranslations('Feature')` in a server one. Keys are typechecked against the Vietnamese bundle, so a typo is a compile error.
4. **Do not miss the non-obvious text**: `aria-label`, `alt`, `placeholder`, `title`, `okText`/`cancelText`, `notFoundContent`, Yup validation messages, `message.success` / `notification` / `Modal.confirm` arguments, `<title>`/meta, empty-state and error-state copy. The audit scans exactly these positions because they are exactly what gets forgotten.
5. **API errors map from the code, not the message.** Backend `message` is Vietnamese and never reaches the screen — `useErrorMessage()` maps `API_ERROR_CODE` through the `Errors` namespace. If your change adds a code in `packages/types/src/api.ts`, add its sentence to `errors.json` in both languages in the same commit.

## Never translated

Codes on the wire (`active`, `self_drive`, `within_7_days`), URL params, DB values, `packages/types` `*_LABEL` / `*_STATUS_META` maps (apps/api still uses them for email/notifications, and `color` is still the colour source), brand and product names. Currency is always VND and the time zone is always `Asia/Ho_Chi_Minh` in both languages — changing either by UI language turns a correct number into a wrong one. And no language prefix in a URL, no `?lang=`, no `app/[locale]`.

## Scope of "convert what you touch"

The unit is the surface you are already changing — the component and its siblings in that feature — converted completely, in the same commit, with `i18n:audit` showing that area gone or measurably smaller. It is not a licence to convert the whole manage portal mid-task, and not an excuse to leave half a dialog translated: a screen with three Vietnamese labels left in an English UI reads as broken, which is worse than a screen that is honestly untranslated. If the area is genuinely too large to finish inside the current task, say so, convert what your change touches, and leave the rest visible in the audit rather than silently allowlisted.

The audit allowlist is for strings that must **never** be translated (brand names, provider names), each with a reason. "Not translated yet" is never a reason.

## Before you call it done

```bash
pnpm --filter @xeprime/web i18n:check     # parity vi↔en, no empty values, ICU + variable sets
pnpm --filter @xeprime/web typecheck      # a mistyped key is a compile error
pnpm --filter @xeprime/web i18n:audit     # your area gone, and no new area added
```

Then read the screen in English. Not the JSON — the screen. A key that renders as `Common.actions.svae`, a sentence whose plural is wrong, a column header still in Vietnamese, a date in US format next to a VND amount: those all pass a diff review and fail a user. If you cannot read the English rendering, at minimum read every new `en` value in order and check it says what the Vietnamese says.
