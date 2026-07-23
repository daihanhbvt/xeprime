---
name: backend-endpoint
description: Adding or changing anything in apps/api — an endpoint, module, service, DTO, guard, or anything that touches the request/response contract or the database from the backend. Load before writing NestJS code so security scope, validation, the response contract, and service boundaries follow the XePrime base.
---

# Adding a backend endpoint the XePrime way

The API is the enforcement layer. The frontend is a convenience; the guarantees live here. Write every endpoint as if a hostile client is calling it directly — because one will.

Read one existing module end to end before writing a new one (`modules/tenants/` is a clean reference: a controller with tags, guards, permission decorators, a typed DTO return, and a service that never trusts the caller for scope). Match its shape.

## Scope is never the client's to assert

For anything tenant-scoped, `tenant_id` comes from the caller's membership via `TenantScopeGuard`/`CurrentTenant`, never from the body, query, or a header. An endpoint that accepts a tenant id from the client is a data-leak wearing the costume of a feature. Platform-scoped endpoints use the platform scope, not the tenant guard — the two never share a guard. This is the first thing to get right and the easiest to quietly get wrong.

## The permission is part of the endpoint

Every protected endpoint declares the permission it requires with `@RequirePermissions`, using a key from `@xeprime/types`. The guard is the real gate — hiding a button on the frontend protects nothing. If the permission you need does not exist yet, add it to the permission set and seed it; do not invent a bare string.

## Validate at the edge, type all the way through

Input is a DTO with `class-validator` decorators; the global pipe rejects anything unlisted. Statuses and enumerated fields validate against the value list from `@xeprime/types` (`@IsIn(...)`), never a free string — the database stores `String`, so this layer is where a typo becomes a rejection instead of a silent bad row (ADR 0005). Service and repository signatures return the union types from `@xeprime/types`; never let a bare `string` status escape the data layer.

## The response contract is generated, so it must be declared

The frontend's types are generated from this API's OpenAPI spec (ADR 0007). That only works if the shape is declared: DTO return types with `@ApiProperty`, wrapped in the `{ data, meta }` envelope, errors as `{ error: { code, message } }` with a code from the shared error set. Money crosses the wire as a string, never a `number` — `Decimal` in, string out, and the interceptor already handles the conversion; do not defeat it. After changing any DTO, regenerate the contract so the frontend sees the change as a type error, not a runtime surprise.

## Invariants belong in the database, services own the writes

Business invariants that must never be violated live as database constraints, not as app-level checks that race. The booking calendar is the canonical case: overlapping occupancy is impossible because of an exclusion constraint, and every schedule write goes through `OccupancyService` inside a transaction (ADR 0006). Likewise the public listing snapshot is written only by `ListingsService` (ADR 0008). When you need to write to one of these tables, call its owning service — a second writer is a second way to corrupt the invariant. A `check-conflict` style endpoint is a UX preview only; it never stands in for the constraint.

## Privileged actions leave a trace

Anything an admin or platform user does that changes another party's data — approving, locking, impersonating, overriding — writes an audit record in the same transaction as the change. If it mattered enough to restrict, it matters enough to log.

## Before you call it done

Trace the request once as an attacker (can I pass a scope I do not own? a status I should not set? skip a permission?) and once as the next engineer (is the contract declared, the money a string, the invariant enforced by the DB and not by hope?). Regenerate the contract, run typecheck, lint, and the tests. For anything touching the schedule, a passing concurrency test is not optional.
