---
name: frontend-feature
description: Building or changing anything in apps/web — a page, component, form, list, hook, calendar surface, or store slice. Load before writing frontend code so state boundaries, styling, data fetching, and reuse follow the XePrime base rather than being reinvented per feature.
---

# Building a frontend feature the XePrime way

You are writing React in a Next.js App Router app that already has a spine. Your job is to extend that spine, not to lay a parallel one beside it. Before the first line, know what already exists; after the last line, the feature should look like it was always part of the codebase.

## Start by finding what you can reuse

Most of what a feature needs already has a home. A value shown on screen, a date or amount rendered, a request to the API, a status badge, a scope check — these have canonical implementations. Read `docs/CODEMAP.md` and the relevant `lib/`, `components/`, `hooks/`, `services/`, and `constants/` before writing. The correct instinct when you need to display or transform something is: *is there a helper for this, and if not, does this belong in a helper rather than inline in my component?* Presentation logic that could recur — formatting, grouping, mapping a code to a label — is helper-shaped, not component-shaped. `apps/web/src/lib/` is where that discipline already lives; match it. A component that inlines transformation logic is a component that just prevented four other features from reusing it.

## Put each kind of state where it belongs

The hardest-won decision in this codebase is the state boundary (ADR 0004), and it is easy to erode one convenient shortcut at a time. Hold the line:

- **Form state** lives in React Hook Form. Use it the way it is designed — a `Controller` (or the project's form-field wrapper) bridging to Ant Design inputs, a Yup resolver from `@xeprime/validators`, validation declared as schema. Form values never go into Redux; a form is local until it is submitted.
- **Server data** — anything the API owns — lives in TanStack Query, keyed through the shared query-keys module. Mutations invalidate the queries they affect. You do not cache server lists in a slice, and you do not hand-roll a fetch where a query belongs.
- **Filters, paging, the current range or tab** live in the URL search params, read and written through the feature's filter hook. This is deliberate: a filtered view must be shareable, survive reload, and respond to the back button.
- **Redux** holds only the small set of genuine global client state — the shell, the current scope, a transient selection. Adding a slice is a claim that the state is none of the above; be able to defend it.

Using a library against its grain "works" right up until it doesn't. The seam is the point.

## Styling

Design tokens through Ant Design's `ConfigProvider`, and CSS Modules for everything else (ADR 0003). No styled-components, no inline style — the single allowed exception is a CSS custom property carrying a value only known at runtime (an event bar's position on the calendar). Colours, spacing, and radii come from tokens, never a hardcoded hex.

## Build the complete feature, at real scale — not the happy path

A feature is not done when it renders correct data in the demo. It is done when it behaves like a product under real use. Before writing a list, page, or form, picture the actual data: a rental-history or bookings view will hold tens, then thousands, then tens of thousands of rows — so it is paginated (or virtualized) from the first commit, with server-side paging, filtering, and sorting wired to the URL, never a client that fetches everything and slices it. A senior does not ship an unbounded list and wait for it to fall over in production; the scale is a given, so design for it up front. If the base lacks a capability the correct solution needs — a pagination primitive, a data-table, a virtualizer — add the dependency; do not hand-roll a worse version or quietly cap the data to dodge the problem.

Every surface handles all of its states, not just the one with data: loading, empty, error, and the partial/permission-limited views. An empty list says something useful; an error is caught and shown, not a blank screen; a slow request shows progress. Forms handle submit failure, validation, and the disabled/in-flight state, not only the successful path. These are not extras bolted on later — they are what separates a product from a task marked done, and leaving them out is shipping a known bug for someone else to hit.

Think through the edge cases the domain guarantees will occur: the very long name, the missing optional field, the record with no related rows, the concurrent edit, the number that overflows the column. Handle them now, while the code is in front of you, because "we'll fix it when a user reports it" is the most expensive way to build.

## Server versus client components

Default to Server Components; reach for `'use client'` only when a boundary genuinely needs state, effects, events, or browser APIs. Push the client boundary as far down the tree as it will go — a page can be a Server Component with a small client island inside it. The `(public)` marketplace is where this matters most for SEO; the `(manage)` portal is mostly client by nature, but that is a reason to keep its client components small and focused, not an excuse to mark everything.

## Nothing hardcoded

Statuses, roles, permissions, and business labels come from `@xeprime/types` and `constants/` — never a bare string in a component (ADR 0005). A status badge reads its label and colour from the type package's metadata map; a menu item carries a permission key; a route is a named constant. If you catch yourself typing a domain string literal, stop and import it.

## Before you call it done

Read the feature back as the next engineer *and* as a user hitting it in production. Is every repeated thing extracted, every library used at its intended seam, every domain string imported, every displayed value going through a helper? Does every list scale — paginated, filtered, sorted server-side — and does every surface handle loading, empty, and error? Are the edge cases the domain guarantees actually handled, not deferred? Run typecheck, lint, and the tests. A feature that "works on the seed data" but folds at real volume, or shows a blank screen on error, is not done — it is a bug you have chosen not to see yet. Finish it now.
