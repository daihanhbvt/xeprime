# 11 — Coverage and Consistency Audit

> **Type:** Documentation audit · **Performed:** 2026-08-04 · **Auditor:** Principal Architect / PM / BA / UX / Documentation Auditor role set
> **Method:** every brief read in full; claims spot-verified against source, schema, migrations, RBAC constants and ADRs; coverage enumerated from the live route tree (37 `page.tsx`), the API catalog, `prisma/schema.prisma` (38 models), and `packages/types/src/rbac.ts` (9 roles, 37 permissions per seed).
> **Mandate limits observed:** no product source modified; no redesign; corrections applied only where source/ADR evidence contradicted a brief; recommendations untouched.

---

## 1. Audit scope

The five check families from the audit charter: **coverage** (pages, components, API operations, models, roles/permissions, workflows, placeholders) · **exclusivity** (one owner per submodule, links-not-duplicates, no false "fully implemented") · **consistency** (statuses, permissions, routes, API behavior, DB facts, recommendation labeling, `Unknown` labeling) · **UX consistency** (state conventions, responsive, a11y, nav/auth, 401/403/no-tenant/multi-scope) · **documentation quality** (references, Mermaid, tables, terminology).

## 2. Files reviewed

All thirteen: `_DESIGN_BRIEF_STANDARD.md`, briefs 00–10, plus this file's inputs — `CLAUDE.md`, `docs/project/01–10`, ADRs 0001–0010, and for contradiction-resolution: `review.service.ts`, `rbac.ts`, `routes.ts`, `schema.prisma`, the platform controllers, and the type files under `packages/types/src/status/`.

---

## 3. Coverage statistics

### 3.1 Pages — 37/37 covered (100%)

Enumerated from `find apps/web/src/app -name page.tsx`. Every route has exactly one owning brief (README §4). No orphans. Note: `/manage` resolves to three experiences (shop dashboard / platform dashboard / NoTenantState) — owned respectively by the shell docs in 00, brief 08, and brief 03; this split is deliberate and cross-linked, mirroring the code's own overload (00 B3).

### 3.2 API operations — 100% assigned

Every operation in `docs/project/04_API.md` (the generated catalog) maps to one brief (README §4). `GET /health` is marked technical-only. The dual-context endpoints (notifications, conversations) follow the shared-engine rule (02 = engine + customer, 07 = shop) with explicit cross-links — verified as links, not duplicated definitions.

### 3.3 Prisma models — 38/38 assigned (100%)

Ownership table in README §4. Four marked **technical-only** with justification: `UserIdentity` (auth linkage), `PasswordResetToken`, `PhoneVerification` (mechanics in 00), `MessageOutbox` (worker infrastructure, 07). Two **dormant models** are explicitly documented rather than silently owned: `AdminNote` (08/09 — no code path), `TenantInvite` (03/07 — no code path). `TenantDocument` documented as model-without-workflow (03, marking table #15).

### 3.4 Roles and permissions — 9/9 roles, 37/37 permissions

All four tenant roles + customer-as-inferred: matrices in 07 §4.1 (verified against `DEFAULT_TENANT_ROLE_PERMISSIONS` during briefs 06–07). All five platform roles: matrices in 08 §3, 09 §4, 10 §4 (verified against `DEFAULT_PLATFORM_ROLE_PERMISSIONS`). All 26 tenant + 11 platform permission keys appear with their guarding endpoints. Three permission anomalies are documented, not glossed: `vehicles.block_schedule` guards nothing (04), `bookings.cancel` guards nothing (05 Q6), chat has no permission at all (07 Q6).

### 3.5 Workflows — all implemented workflows covered

Auth (00) · discovery→request (01→05) · request→booking→transition→occupancy (05) · payment/receipt/debt/contract (06) · review loop (02) · chat+outbox projection (02/07) · member/staff lifecycle (07/10) · tenant & vehicle approval both sides (03/04↔08) · lock/hide moderation (08) · reveal+audit (09) · plan/subscription (10). Cross-checked against `docs/project/08_WORKFLOW.md` — no workflow there lacks a brief.

### 3.6 Placeholders/TODO/deferred — all covered with required markings

The six placeholders (customers, pickup-areas, drivers, trash, maintenance-workflow, calendar interactions), every ADR-deferral (0010's four Hoãn items in 10; chat realtime flag; document approval), and every discovered dead-vocabulary item are classified. Count of "Referenced but not implemented" findings across the series: **25** (§3.7).

### 3.7 Consolidated final coverage table

All product submodules identified across the series, with owner and status (the union of the eleven §R4 tables; ✅ Implemented · 🟡 Partial · ⬜ Placeholder · 🔗 Referenced-not-implemented · ❌ Missing):

| Domain | Submodule | Owner | Status |
|---|---|---|---|
| Auth | Session/login/register/OTP/reset · post-auth routing · safe-next | 00 | ✅ |
| Auth | Provider (Google/FB) login | 00/02 | ⬜ (buttons fail) |
| Auth | CSRF · session revocation · sliding renewal | 00 | 🔗 (ADR 0002 mandates) |
| Marketplace | Home/detail/shop pages, filters, facets, sort, pagination, cards | 01 | ✅ |
| Marketplace | Keyword-search UI · results route · availability-on-detail · price contract · SEO infra | 01 | 🔗/❌ |
| Marketplace | Saved vehicles | 01 | ⬜ (dead button) |
| Customer | Account/profile · trips list · review submit/effects · chat · notifications · logout | 02 | ✅/🟡 |
| Customer | Trip detail · cancellation · notification channels · guest notification | 02 | ❌/🔗 |
| Onboarding | Intent→registration→profile→submit→statuses · NoTenantState | 03 | ✅ |
| Onboarding | Documents · invites · qrUrl · provinceCode · settings JSONB · EXPIRED writer · pickup areas | 03 | 🔗/⬜ |
| Fleet | CRUD/search/detail · both axes · publication+knock-back · delete guard · hide/unhide · quota | 04 | ✅ |
| Fleet | Blocked ranges · maintenance workflow · drivers · trash · seasonal pricing · imageType | 04 | 🔗/⬜ |
| Rental | Requests (public+inbox) · bookings · transitions · occupancy/constraint · calendar read · contracts | 05 | ✅ |
| Rental | Request cancel/expiry · price-on-approval · calendar interactions · contract signing · buffer | 05 | 🔗/⬜ |
| Finance | Dashboard · receipts/categories · payments/void · debt · snapshots | 06 | ✅/🟡 |
| Finance | Attachments workflow · reports/charts/exports · deposit lifecycle · gateway | 06 | 🔗/❌ |
| Shop org | Members lifecycle · RBAC resolution · shop chat · shop notifications | 07 | ✅ |
| Shop org | Shop customers · custom-role management · support participant · assignment/read-per-member | 07 | ⬜/🔗 |
| Governance | Dashboard/KPIs · approvals (3 verbs) · lock/unlock · hide/unhide · audit-write | 08 | ✅ |
| Governance | Criteria/checklist · cross-task history · bulk · document approval · CANCELLED status | 08 | 🔗/❌ |
| Privacy | Monitors · masking · reveal+audit · audit read/filters/detail | 09 | ✅ |
| Privacy | Support tickets · review moderation · reveal governance · retention/rights | 09 | ❌/`Unknown` |
| Billing | Staff mgmt+protections · plans · subscriptions (assign/renew/cancel/snapshot/derived-expiry) | 10 | ✅ |
| Billing | Invoices · limitsJson · expiry consequences · shop-facing plan surface · full enforcement | 10 | ❌/🔗/🟡 |

---

## 4. Contradictions discovered and corrections applied

Only one **factual contradiction between briefs** survived to this audit, and it was pre-flagged:

| # | Contradiction | Resolution | Evidence |
|---|---|---|---|
| C1 | Brief 01 §23 claimed public reviews expose `customerName` with "no masking applied" and posed Q8; brief 02 K9 proved `ReviewService.toPublicDto` applies `maskName` (surname → initial) | **Corrected brief 01** (§23 rewritten, Q8 struck-and-annotated, §33 consistency row updated, MK10 added) and **marked brief 02 K9 resolved** | `apps/api/src/modules/review/review.service.ts` `maskName` |

**Checked and found *not* to be contradictions** (differences that resolve on inspection):

- 05 vs the shared `BOOKING_DATE_FIELD`: 05 records the shop list does *not* consume it; 09 §6 confirms the platform monitor *is* its consumer — consistent, and 05 names 09's usage explicitly.
- 04 edge 12 initially suspected the server gallery cap `Unknown`; verified `@ArrayMaxSize(20)` and corrected in-flight before publication (recorded in 04's verification log, not a post-hoc fix).
- 05's migration attribution for the double-submit partial index was corrected in-flight (`add_phone_login`, not `add_booking_requests`) — likewise recorded in 05's own log.
- 00 K-series vs domain briefs: every 00-level defect referenced by a domain brief (K4 flat permissions, K8 dual unread, F2 revocation…) uses identical wording-by-reference, no drift.
- Status vocabularies: every status name cited in every brief was grepped against `packages/types/src/status/*`; zero mismatches (including the deliberately-dead ones, which are consistently marked writer-less rather than renamed).
- Routes: all cited paths exist in `routes.ts`/the route tree; the two compat routes (`/login`, `/register`) are consistently described as proxy redirects.

## 5. Duplicate ownership discovered

**None requiring correction.** Three intentional shared-engine splits (chat, notifications, approval) are consistently expressed as owner-plus-context with cross-links (verified in all six participating briefs). `PublicListing` read/lifecycle and `AuditLog` read/write splits are declared in the README map. No submodule was found defined differently in two places.

## 6. Exclusivity and omission check

Swept for accidentally omitted submodules by diffing three sources against the briefs: the nav trees (`SHOP_NAV`/`PLATFORM_NAV` — every leaf owned), the feature-folder census (28 web features — every folder owned), and `docs/project/10_MISSING_FEATURES.md` (every listed gap appears in some brief's missing/referenced section). **One near-miss found and accepted as covered:** the shop *dashboard* itself (`ManageHome`/`DashboardView`) has no dedicated brief section — it is documented via 00 (shell/scope switch), 05 R-12 (missing today-view) and 06 (finance panels feed it). Recorded here as thin-but-covered rather than omitted; a future dashboard redesign brief may claim it.

No module is described as fully implemented when partial: the audit re-checked every "Implemented" row that a *different* brief criticizes (e.g. trips ✅-as-list but 🟡 overall; enforcement ✅-at-creation but 🟡 as a subject) — statuses are qualified correctly in all cases.

## 7. UX-consistency findings

The domain briefs' §"Consistency check against brief 00" tables were themselves audited: every claimed conformance/deviation was spot-checked and none misreports. The **systemic deviations** are consistently identified rather than contradictory: component-state filters (02 trips, 06 dashboard-range, 07 members, 10 staff/plans — four occurrences, all flagged against ADR 0004) · bare-text errors without retry (02 chat surfaces) · inverted confirmation severity (04 submit-vs-delete, 07/10 inline role change) · list-not-item notification routing (02/07) · no tablet rules anywhere · table-overflow instead of card conversion. 401/403/no-tenant/multi-scope are documented once (00 §6) and referenced elsewhere without conflict — including the three-way `/manage` overload and the platform-wins scope rule.

## 8. Remaining unknowns

The consolidated register: **~110 open questions** across briefs 00–10 (00: 14 · 01: 13 · 02: 17 · 03: 13 · 04: 9 · 05: 12 · 06: 13 · 07: 11 · 08: 11 · 09: 10 · 10: 10, minus cross-references). Deduplicated to **15 gating decisions** in README §9. Every unknown in the briefs is explicitly labeled `Unknown` or lives in an Open-questions table — the audit found **no unlabeled speculation** presented as fact, and no recommendation outside a marked block (grep for the marker: 60+ occurrences, all in recommendation contexts).

## 9. Risk areas

Ranked by (impact × confidence), for reviewer attention:

1. **Legal/retention vacuum** (09) — every privacy control is built atop unstated legal requirements; a wrong assumption here invalidates work across 02/09.
2. **The zero-đồng conversion** (05 §1.2 → 06 edge 7) — a correctness-adjacent business gap the ledger silently absorbs.
3. **Silent corrective actions** (03/04/08) — revision/lock/hide notify nobody; operationally this manufactures support load and shop churn.
4. **Guest-booker blind spot** (02/05/09) — no notifications, no trips, PII without a rights anchor.
5. **Dead vocabulary debt** (~25 items) — each is a latent misunderstanding for the next engineer; the keep-or-kill decision is cheap and repeatedly deferred.
6. **ADR 0002's unimplemented mandates** (CSRF, revocation) — the one place an accepted ADR and the code disagree; deployment-topology answer (00 Q1) decides urgency.
7. **Single-maintainer conventions** — append-only audit, single-writers, and permission restatement are enforced by discipline and tests, not constraints, in several spots the briefs enumerate.

## 10. Documentation quality assessment

| Criterion | Result |
|---|---|
| Source references | 13/13 files carry them; every behavioral claim traced (per-brief verification logs list the negative censuses too) |
| Mermaid | 14 diagrams across 9 files; syntax-checked by inspection (stateDiagram-v2/flowchart/sequenceDiagram forms all well-formed; one prior fix in 05's state diagram during drafting) |
| Tables | Readable throughout; widest (00 §2.3, this file §3.7) remain within GitHub rendering norms |
| Standard conformance | 13/13 follow `_DESIGN_BRIEF_STANDARD.md`: R4 status tables present in all 11 briefs (00-series added 05's in-flight), six-block separation observed, resolved-not-deleted pattern now demonstrated (01 MK10 / 02 K9) |
| Terminology | Briefs are English-prose with Vietnamese UI strings quoted verbatim — so the glossary check applies to quoted strings, which match the product: *khách thuê, gian hàng, chủ gian hàng, đơn thuê, quản trị nền tảng* used consistently. **One product-level inconsistency is documented rather than hidden**: the request entity is "Yêu cầu thuê" (customer CTA), "Đơn đặt xe" (shop nav), and "yêu cầu đặt xe" (type-file comments) — recorded in 00 §7.4 C3/K9 and `docs/design/01` §9 chose "yêu cầu thuê" as canonical; the briefs quote each surface faithfully pending product's answer (README §9 #15 adjacent, 00 Q14) |
| Recommendation hygiene | 100% of proposals inside marked blocks/tables |

## 11. Final readiness assessment

**Verdict: READY for design and product review, with two caveats.**

The collection is complete (100% page/API/model/role coverage), internally consistent (one factual contradiction found and corrected; all shared submodules link rather than duplicate), honestly classified (no partial module claims full implementation), and standard-conformant. It is sufficient to brief designers on any of the ten domains and to hand engineers regression contracts per module.

**Caveats:** (1) the ~15 gating unknowns (README §9) mean several briefs' recommendation sections cannot be prioritized until product answers — the docs are ready; the roadmap they'd feed is not; (2) runtime-only facts (device rendering, contrast, screen-reader output, production config) are `Unknown` by construction and need testing, not documentation.

**Post-audit verification performed:** exactly one README in `docs/design-briefs/` · all 11 main briefs + standard + this audit exist (14 files) · corrections touched only `docs/design-briefs/01_*` and `02_*` · `git status` confirms no product source modified · every brief re-checked for an R4 status table and marked recommendations.
