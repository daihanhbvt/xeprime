# Design Brief Standard

> Status: Accepted · Created 2026-08-04 · Applies to every file in `docs/design-briefs/`.
> This standard defines **how** a design brief is written. It does not describe any product behavior.

---

## 1. Purpose

A design brief is the bridge between the as-built system (`docs/project/`), the accepted architectural decisions (`docs/decisions/`) and future product/UX work. It exists so that a product manager, business analyst, UX architect and engineer can share one document without any of them having to guess which sentences describe reality and which describe an idea.

A design brief is **not**: a redesign, a wireframe set, a component specification, a ticket, or an implementation plan.

---

## 2. Non-negotiable rules

### R1 — Evidence or `Unknown`

Every statement about existing behavior must be traceable to at least one of:

| Evidence class | Weight | Example |
|---|---|---|
| Source code | Authoritative | `apps/api/src/common/guards/auth.guard.ts` |
| Database migration / schema | Authoritative | `prisma/schema.prisma` |
| Accepted ADR | Authoritative | `docs/decisions/0002-auth-session-cookie.md` |
| As-built documentation | Secondary | `docs/project/04_API.md` |
| Historical business specification | Weakest, may be superseded | `docs/xeprime_screen_spec_by_role_before_db.md` |

If two evidence classes conflict, the higher-weight one wins and the conflict is recorded under **Known inconsistencies**.

If no evidence exists, the brief writes `Unknown`. Writing `Unknown` is always correct; guessing never is.

### R2 — Never present a recommendation as current behavior

Recommendations must be physically separated from descriptions, not merely worded differently. Every recommendation carries the marker **`[RECOMMENDED — NOT CURRENT]`** or lives inside a section whose heading contains "Recommended".

Forbidden phrasing in descriptive sections: "should", "must", "will", "ought to", "we need to" — unless quoting an accepted ADR or an enforced code rule, in which case the source is cited inline.

### R3 — No invented business requirements

A brief may record that a capability is absent. It may not assert why the business wants it, what the acceptance threshold is, or what the priority is, unless a cited source says so. Unsourced product intent goes to **Open product questions** as a question, not to the body as a fact.

### R4 — Classification is mandatory

Every subject covered by a brief is assigned exactly one status:

| Status | Definition |
|---|---|
| **Implemented** | Working code path exists end to end for the described behavior. |
| **Partially implemented** | A code path exists but does not cover the whole described subject (missing states, missing surfaces, missing enforcement, environment-gated). |
| **Placeholder** | A visible surface exists that intentionally does nothing (stub page, disabled control, `TODO`). |
| **Referenced but not implemented** | Named in an ADR, comment, schema, type, config or menu, with no functional code path. |
| **Unknown** | Cannot be determined from source, schema or accepted ADRs alone (typically runtime, production configuration or human process). |

Classifications appear in a status table near the top of the brief and are repeated inline where the subject is discussed.

### R5 — Scope discipline

A brief documents product and UX rules. It does not contain: React/TypeScript implementation code, final visual design, wireframes, color values not already defined in the token source, or database column proposals.

Diagrams are allowed and encouraged where they reduce ambiguity. Mermaid only (renders in the repository host).

### R6 — Read-only toward the product

Producing a brief never modifies application code, API code, schema, migrations, configuration, tests, or documentation outside `docs/design-briefs/`.

---

## 3. Required document structure

Every brief uses these sections, in this order. A section that does not apply is kept with the text `Not applicable — <reason>` so that the omission is visible and deliberate.

```
1.  Metadata header (date, owners, status, sources of truth)
2.  Executive summary
3.  Scope
    3.1 In scope
    3.2 Out of scope
    3.3 Subject status table          ← R4
4.  Product principles
5.  Personas and contexts
6.  <Domain sections>                 ← brief-specific, each using the six-block pattern
7.  Edge cases
8.  Known inconsistencies
9.  Open product questions
10. Acceptance criteria
11. Source references
```

### The six-block pattern

Inside every domain section, information is separated into these blocks. Blocks that are empty are omitted, but their order never changes — a reader must always know which block they are in.

| # | Block | Contains | Never contains |
|---|---|---|---|
| 1 | **Confirmed current behavior** | What the system does today, with file references | Opinions, gaps, wishes |
| 2 | **Confirmed business rules** | Invariants enforced by code, constraints or accepted ADRs | Rules only stated in historical specs |
| 3 | **Existing UX constraints** | Facts that limit design choices (architecture, ADRs, platform) | Complaints |
| 4 | **Existing UX problems** | Observed defects/frictions in what exists, each with evidence | Proposed fixes |
| 5 | **Unknown requirements** | Explicit `Unknown` items and why | Speculation |
| 6 | **Recommended future behavior** | Marked `[RECOMMENDED — NOT CURRENT]` | Anything asserted as existing |

---

## 4. Writing conventions

| Aspect | Convention |
|---|---|
| Language | English prose. UI strings quoted verbatim in their original language. |
| Identifiers | Code identifiers, routes, permission keys, status values and error codes in backticks, spelled exactly as in source. |
| Paths | Repository-relative, as Markdown links, e.g. `[proxy.ts](../../apps/web/src/proxy.ts)`. |
| Statuses/roles | Only values that exist in `packages/types` — never invented. |
| Tense | Present tense for current behavior; conditional only inside recommendation blocks. |
| Numbers | Only cited from code/config. No invented thresholds, targets or metrics. |
| Vagueness | "Some", "most", "generally" are only acceptable when the brief also states what was and was not checked. |

---

## 5. Brief-specific requirements

| Brief type | Additional obligation |
|---|---|
| `00_CROSS_CUTTING_*` | Must define rules other briefs inherit, and list what it does **not** decide. |
| Module briefs (`NN_<MODULE>`) | Must state which cross-cutting rules apply unchanged, which are specialized, and why any deviation exists. |
| Any brief describing an authorization surface | Must state the enforcing backend guard/permission, not only the client behavior. |
| Any brief describing personal data | Must state masking, reveal path and audit behavior, or `Unknown`. |

---

## 6. Acceptance checklist

A brief is complete when every line is true:

- [ ] Every subject listed in the request appears in the status table with exactly one R4 status.
- [ ] Every claim about existing behavior cites a file, migration or accepted ADR.
- [ ] Every recommendation is inside a recommendation block or carries `[RECOMMENDED — NOT CURRENT]`.
- [ ] No unsourced business requirement appears outside **Open product questions**.
- [ ] All required structural sections are present or explicitly marked not applicable.
- [ ] Every domain section follows the six-block order.
- [ ] `Unknown` is used wherever evidence is absent.
- [ ] Statuses, roles, permissions and error codes match `packages/types`.
- [ ] Diagrams are Mermaid and add clarity rather than repeating prose.
- [ ] No file outside `docs/design-briefs/` was created or modified.

---

## 7. Maintenance

A brief is a dated snapshot of understanding. When the implementation changes:

1. Update the affected six-block content and its R4 status.
2. Move any recommendation that has shipped from block 6 into block 1, with its new source reference.
3. Update the metadata date.
4. Do not delete resolved entries from **Known inconsistencies** — mark them resolved with the change reference, so the history of the decision survives.

Accepted ADRs remain authoritative over every brief. A brief never overrides an ADR; if a brief disagrees with one, that disagreement belongs in **Open product questions**.
