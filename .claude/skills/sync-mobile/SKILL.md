---
name: sync-mobile
description: Sync new web/API business logic into BOTH mobile apps (XePrime customer + XePrime Partner) so mobile matches web 100% in business terms - pull develop, read the sync log, diff git history from the last checkpoint, report PRs/changes/status as tables, port every missing point (rules, show/hide flags, displayed info, permissions, track, validation, error codes, copy, states) with native mobile behaviour, have ONE other agent review for gaps/missing items, fix them, then update the log. Skips admin/platform; the Partner app has no IAP and never mentions plans ("gói"). Invoke with /sync-mobile.
---

# /sync-mobile - sync web → both mobile apps

**Context:** web and mobile are built by two developers in two parallel sessions. When web/API changes and mobile doesn't follow, the apps miss features, miss information, show the wrong buttons, send the wrong payloads, or get rejected by the server. Goal: both apps (XePrime customer `apps/mobile/customer` + XePrime Partner `apps/mobile/manage`, shared code `apps/mobile/shared`) carry **business logic identical to web** at the latest `develop` commit.

**The ONLY allowed differences from web:**
1. **IAP / buying plans in the Partner app**: no buying or paying for plans in the app, never mention plans ("gói"); where web invites buying/upgrading a plan, the app uses neutral wording or hides the purchase path (ask the user when there is no precedent).
2. **Admin/platform** (`(admin)`, `platform.*`, `@PlatformOnly`): not synced.
3. **Native interaction** (sheet instead of modal, own screen instead of dialog, scrolling/tabs…): may be adapted, but the business OUTCOME and the INFORMATION shown must match web.

Any other difference from web = a sync bug.

### Business from web, behaviour from mobile

**WHAT** (rules, data, conditions, outcomes) comes from web. **HOW the user touches it** (opening pages, popups, picking, typing) follows native conventions - never transplant desktop/web patterns onto a phone.

| Web does | Mobile does | Keep from web |
| --- | --- | --- |
| Modal/Dialog with a form, multi-step | Own screen (push route) or tall bottom sheet; long form ⇒ own screen | Fields, validation, confirm button, result after saving |
| Short confirm modal ("Are you sure…?") | Confirm bottom sheet / the existing `ConfirmSheet` | Wording, destructive button, when it asks |
| Right-side detail drawer | Own detail screen (push) | Every piece of info and every action in the drawer |
| Popover / Tooltip ⓘ | `InfoHint` (tap to open) | Explanation content |
| Dropdown `Select` | `SelectField` opening a picker sheet (with search for long lists) | Options, default, lock |
| DatePicker / RangePicker | Native picker / `MomentPickerSheet` | Allowed date/time bounds |
| Multi-column table | Card list (colour bar on the left + status top right), detail on its own screen | Key columns, default sort/filter, paging |
| Numbered pagination | Infinite scroll + pull to refresh | Same server-side query/filter/sort |
| Tabs / Segmented | Tabs at the top or horizontal filter chips | Which tabs show for whom, counts |
| Horizontal filter bar | "Filter" button opening a sheet, active filters as horizontal chips | Filter conditions, defaults |
| `message.success/error` (toast) | `useAppToast` | Message text, when it fires |
| Buttons revealed on hover | Always-visible buttons or a "…" menu (action sheet) | Actions and when they are allowed |
| Link opening a new tab / file download | In-app browser / share sheet / native file open | Link target, file |
| Drag-and-drop upload | Pick from library / take a photo | Max count, size, file types |
| Sticky footer / button at the end of a form | Button pinned to the bottom (keyboard- and safe-area-aware) | Label, disabled/loading state |
| URL `?query` keeping filters | Screen state / route params | Filters still correct on return |
| Page-top banner | Callout/banner at the top of the screen | Show condition, wording, CTA |

Principles:
- Use the existing components in `apps/mobile/shared/src/components` first (`ConfirmSheet`, `SelectField`, `InfoHint`, `Callout`, `Card`, `DataRow`…); don't rebuild them.
- Native behaviour must never LOSE information or actions: anything inside a web popup/drawer must be reachable on mobile.
- Navigation: back button, swipe back and the Android hardware back all behave correctly; after saving, return to the right screen with refreshed data.
- The keyboard never covers the focused input / submit button; iPad via `use-responsive`.
- Unsure whether a sheet or a screen ⇒ follow the precedent of a similar screen already in the app; no precedent ⇒ ask (step 5).

## 1. What "identical to web" means - checklist for EVERY change

Check every web/API change against all items below. If an item doesn't apply, write "n/a" - never skip silently.

| # | Item | Mobile must match web in |
| --- | --- | --- |
| 1 | **Business rules / calculations** | Money formulas (platform fee, commission, tax, insurance, hold payment, 30% upfront rent, deposit, discounts), time windows (payment deadline, free cancellation, handover opening, response deadline), caps/floors, rounding. Use `@xeprime/domain` functions when they exist; never recompute differently |
| 2 | **Show/hide flags, render conditions** | Every `if`/display condition: blocks, buttons, tabs, warnings, banners, callouts, badges. Same conditions, same precedence, same data fields deciding them |
| 3 | **Displayed information** | Every field web shows must show in the app (amounts, fee lines, dates/times, status, reasons, notes, ⓘ explanations, partner names…). One missing line = a bug |
| 4 | **Information that must NOT show** | Data web deliberately hides stays hidden: phone/address before a booking exists (ADR 0056/0073/0077), owner-side lines on customer surfaces (ADR 0064 §11), driver wage on the customer side (ADR 0075) |
| 5 | **Permissions & viewer role** | Customer / commission owner (Owner Lite) / package-track shop / staff with or without the permission / shop owner (`ownerOnly`). Same permission keys, same track gate (`SubscriptionTrackOnly`), same expired-plan behaviour (read-only/hidden) |
| 6 | **States & lifecycle** | Every new/changed status (`BOOKING_STATUS`, request, hold, handover, insurance…), labels via `useDomainLabel`, colour/tone, allowed transitions, `*_LIVE_VALUES` constants |
| 7 | **Forms & validation** | Added/removed fields, required/optional, min/max/caps, field locks, defaults, autofill, shared schemas from `@xeprime/validators`, error messages |
| 8 | **API contract** | Endpoint, method, query, payload, new response fields, money as STRING (ADR 0007); the mobile API layer in `apps/mobile/shared/src/api/<feature>/` (ADR 0031 - it does not sync itself) |
| 9 | **Error codes** | New API error codes have translations in the `Errors` namespace and are handled like web (toast, field error, pre-blocked in the form) |
| 10 | **Cache & refresh** | Query keys, invalidation after mutations, polling/refetch - so screens never show stale numbers |
| 11 | **Copy & i18n** | Same message keys (`packages/domain/messages/{vi,en}`); new namespaces added to `apps/mobile/shared/src/i18n/messages.ts`; short hyphen `-`, `DATE_TIME_SEPARATOR`/`LIST_SEPARATOR` (`ui-text-style`); no raw strings |
| 12 | **Navigation & deep links** | Targets of buttons/notifications (`notification-delivery`), mobile routes matching web URLs, back behaviour |
| 13 | **Screen states** | Loading / empty / error / no permission / read-only / legacy data, as on web |
| 14 | **Notifications & reminders** | New notification types, deep links, push, badge counts |
| 15 | **Which app** | Customer / Partner / both; differences via `APP_PROFILE.clientApp`, one shared implementation |

## 2. Hard rules

| Rule | Detail |
| --- | --- |
| Web is the READ-ONLY source | **Prefer CLONING logic into `apps/mobile/shared/src`**; don't touch `apps/web`. Import from `@xeprime/*` when the function already exists there. Extracting into a package is optional, only when the logic is long and likely to drift - then web ONLY re-exports, with no behaviour change. At the end, `git diff apps/web` must be empty or re-exports only. Bugs/duplication noticed on web ⇒ report them, don't fix them |
| Never invent logic | No guessing; every condition/calculation is copied from web code + ADRs. Web and ADR disagree ⇒ report and ask |
| Don't sync admin/platform | Log as `NOT_APPLICABLE - PLATFORM_ADMIN`. "Admin" commits can still carry non-admin work (permissions, shared fields, error codes) - read the real DIFF |
| Partner app | No IAP; never mention plans ("gói")/buying plans - neutral wording; anything touching plan purchase/payment ⇒ ask before coding |
| Order | Walk develop commits ONE BY ONE, oldest → newest |
| Mobile UI | Keep the agreed standards: the "Đơn thuê" (rentals) screen is the template; list cards have a colour bar on the left + status top right; iPad via `use-responsive`; colours via the light/dark theme; never break Figma styling already done |
| New native dependency | (e.g. `expo-sharing`) ⇒ ask, mark `OPEN`; say clearly if `expo prebuild` is needed |
| No commit/push on your own | Ask every time. Feature branches never track `origin/develop` (`git branch --unset-upstream` right after creating) |
| No typecheck/tests | Unless the user asks - only REPORT which tests are affected |
| At most ONE helper agent | Only for the review step; do everything else yourself |
| Language | All reports to the user in Vietnamese, as tables |

## 3. Steps

### Step 1 - Update code
- `git status` - work in progress ⇒ `git stash push -u -m "<description>"`; after updating ⇒ `git stash pop`, resolve conflicts keeping BOTH sides (develop's style/UI + your sync logic); never throw either away.
- `git fetch origin` → `git checkout develop && git pull --ff-only`, or fast-forward the current sync branch (`git merge --ff-only origin/develop`).
- Work on a `feat/mobile-web-parity-<yyyymmdd>` branch created from develop; unset its upstream immediately.

### Step 2 - Read the sync log
- `apps/mobile/docs/sync-log.local.md` (LOCAL, gitignored). Take:
  - the **CHECKPOINT** = the last develop commit already reconciled (latest round, end of file);
  - every item still `OPEN` from earlier rounds (carried into this round).
- Unclear checkpoint (previous round unfinished, branch not merged) ⇒ ask which commit to re-audit from.

### Step 3 - List and read the changes
- `git log --first-parent --reverse --format="%h %ad %s" --date=short <CHECKPOINT>..origin/develop` - PR numbers come from the merge commits.
- For each PR: `git show --stat`, then read the REAL DIFF in `apps/api`, `apps/web`, `packages/{types,domain,validators}`, `packages/domain/messages`, `prisma`, `docs/decisions` (new/changed ADRs) and `CLAUDE.md` (new rules). Never infer from commit titles.
- **Split every PR by FEATURE, from its file list - not by its title.** Run `git diff --stat <merge>^1 <merge>` (merge commits) or `git show --stat <sha>`, group the changed paths by feature folder (`apps/web/src/features/<x>`, `apps/web/src/app/(<group>)/<route>`, `apps/api/src/modules/<x>`, `packages/domain/messages/*/<ns>.json`). EACH feature group with changes becomes its OWN row in Table 2, even when the PR title names something else. Real miss (19/11): PR #313 "feat: vehicle create figma" also rewrote 15 files of `features/auth` (partner forgot-password 3 steps, "remember me", register frame); the round logged it as "Thêm xe Figma - DONE" and the app missed the auth changes for two days.
- A row may say "web + app done in the same batch / same PR" ONLY after checking, feature group by feature group, that the mobile side has matching changes in the same range (`git diff --stat <range> -- apps/mobile`). A web feature group with no matching mobile change stays OPEN until ported or marked NOT_APPLICABLE with a reason.
- Mobile commits by the other developer (`apps/mobile/**`) ⇒ note them, check they are complete, don't port them again.
- For each change, find the matching mobile files (grep component/function/message key/endpoint names) and run the full 15-item checklist.

### Step 4 - Report BEFORE coding (tables)
**Table 1 - new PRs:** `PR · date · title · scope (api/web/mobile/admin/docs) · ADR`.

**Table 2 - per-change reconciliation:** `# · SHA/PR · Feature group (folder) · Business change · Where on web/API (file) · Mobile today (file / missing) · Checklist items out of sync · Applies to (Customer/Partner/Both/None) · Status (DONE/OPEN/NOT_APPLICABLE)`. One row per FEATURE GROUP of a PR (step 3), never one row per PR title - a PR touching vehicles + auth is at least two rows.

**Table 3 - OPEN items carried over** from earlier rounds.

### Step 5 - Ask what needs a decision
Needs the user: anything touching IAP/plan purchase; neutral wording replacing "gói"; a new native dependency; web vs mobile Figma conflicts; web vs ADR conflicts; the re-audit checkpoint; a web feature with no sensible home on mobile yet.
- Print a table `# · Issue · What web does · Mobile today · Proposed option`.
- Then `AskUserQuestion`: max 4 questions per round, each self-contained (name the screen/block), recommended option first with "(Khuyến nghị)".
- Do the parts that don't depend on the answers first; don't sit idle.

### Step 6 - Sync
- Read the `mobile-feature` skill before writing mobile code; `i18n` + `ui-text-style` before writing copy.
- Port in this order: API client + types → hooks/queries/mutations → logic/calculations → forms/validation → screens/blocks → i18n copy → navigation/notifications.
- Web logic ⇒ CLONE into `apps/mobile/shared/src`, with a source comment: `native port of web \`<file/function>\``. Keep conditions, precedence and field names identical.
- Interaction ⇒ apply the "Business from web, behaviour from mobile" table.
- One change = all 15 checklist items; record which ones now match.
- Every screen touched: loading/empty/error/no permission all present; correct track + role.

### Step 7 - Review by ONE other agent
Spawn exactly ONE agent (`reviewer` or `general-purpose`) with a self-contained brief (it has no context):
- the commit range `<CHECKPOINT>..<develop HEAD>`, the PR list + related ADRs, the current branch;
- the rules: section 1 (15-item checklist), the "business from web, behaviour from mobile" table, the IAP/admin exceptions, web is read-only;
- the job: build its OWN feature-group list from `git diff --stat` of the range (not from PR titles or the step-4 table), then for EACH web/API feature group compare against `apps/mobile/{shared,customer,manage}` and find:
  - **MISSING** - not ported;
  - **GAP** - ported but missing a field / condition branch / state / error code / message key / permission / invalidation;
  - **WRONG** - deviates from web/ADR rules, computes differently, shows data web hides;
  - **VIOLATION** - IAP, "gói" in Partner, logic changes in `apps/web`, raw strings, long dashes;
- do NOT hand it your conclusions - only the commit range and code paths;
- return a table `# · Severity (high/medium/low) · Mobile file:line · Problem · Web evidence (file:line) · Suggested fix`.

On return: verify EVERY finding against the real code; record why rejected ones are wrong.

### Step 8 - Fix the rest
Fix every confirmed finding; anything needing a decision ⇒ back to step 5. Re-check `git diff apps/web`.

### Step 9 - Update the log
Append to `apps/mobile/docs/sync-log.local.md`:
`## Đợt dd/mm/yyyy - <CHECKPOINT> → <HEAD> (#first PR → #last PR), nhánh <name> (chưa commit)`, containing:
- the reconciliation table (step 4, final status);
- the review-fix table (steps 7-8: finding · action · reason if rejected);
- decisions the user made (step 5);
- message keys added/removed; new files;
- items still `OPEN` + why; affected tests.
The log is a local file - never add it to git.

### Step 10 - Final report (tables, in Vietnamese)
- PRs synced · mobile/package files changed · `apps/web` diff (empty or re-exports only)
- Review: found / fixed / rejected (why)
- Still `OPEN` + decisions needed from the user
- Not committed, no typecheck/tests run (list affected tests); ask whether to run the app for a UI check or commit.
