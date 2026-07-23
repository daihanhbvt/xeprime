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

## Server versus client components

Default to Server Components; reach for `'use client'` only when a boundary genuinely needs state, effects, events, or browser APIs. Push the client boundary as far down the tree as it will go — a page can be a Server Component with a small client island inside it. The `(public)` marketplace is where this matters most for SEO; the `(manage)` portal is mostly client by nature, but that is a reason to keep its client components small and focused, not an excuse to mark everything.

## Nothing hardcoded

Statuses, roles, permissions, and business labels come from `@xeprime/types` and `constants/` — never a bare string in a component (ADR 0005). A status badge reads its label and colour from the type package's metadata map; a menu item carries a permission key; a route is a named constant. If you catch yourself typing a domain string literal, stop and import it.

## Before you call it done

Read the feature back as the next engineer: is every repeated thing extracted, every library used at its intended seam, every domain string imported, every displayed value going through a helper? Run typecheck and lint. If you extracted something into a shared place, that is a good sign, not scope creep.
