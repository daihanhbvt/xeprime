---
name: database-change
description: Changing the data model — editing prisma/schema.prisma, writing a migration, adding a table/column/index/constraint, or a seed. Load before touching the schema so conventions, migration safety, and the constraint-first discipline follow the XePrime base.
---

# Changing the data model the XePrime way

The schema is the most expensive thing to get wrong, because data outlives code. A migration that ships is a decision you live with. Move deliberately.

Read `prisma/schema.prisma` and the baseline migration (`prisma/migrations/20260821000000_init/migration.sql`) before changing anything — the conventions are consistent and you should disappear into them. **Read the baseline's header before running `prisma migrate dev`:** it lists composite foreign keys `(id, tenant_id)` that `schema.prisma` cannot describe, and Prisma will generate `DROP` statements for them. Strip those from the generated migration — a migration that silently drops a cross-tenant guard is worse than no migration.

## Conventions are not optional

Table and column names are snake_case via `@@map`/`@map`; ids are `char(26)` ULIDs generated in the app; money is `Decimal(14,2)`; timestamps are `timestamptz`; structured blobs are `jsonb`; every tenant-owned table carries `tenant_id`, `created_at`, `updated_at`, and a soft-delete `deleted_at` where the data is worth keeping. Status columns are `String`, and their allowed values live as a union in `@xeprime/types` — the database does not enum-enforce them, so the type package and, for stable tables, a `CHECK` constraint are what keep them honest (ADR 0005).

Identity is unique **per realm**, not globally: the same phone, email or Google account can own one account in each of `customer`, `partner`, `platform` (ADR 0053). A new identity column gets a unique index on `(realm, <column>)`, never on the column alone. Money obligations are never hard-deleted: `wallets.owner_*` and `promo_redemptions.promo_code_id` are `RESTRICT`, ledgers are append-only and corrected by a reversing row (ADR 0033, 0046).

## Make invalidity impossible, not merely discouraged

The strongest guarantee is one the database enforces regardless of what any code does. When a rule must never be violated, express it as a constraint — a unique index, a check, an exclusion constraint — not as an application check that two concurrent requests can both pass. The booking calendar is the reference: overlap is prevented by `EXCLUDE USING gist` on a range column, so no code path, transaction interleaving, or forgotten guard can create a double-booking (ADR 0006). Before adding an app-level "make sure there isn't already…", ask whether it should be a constraint instead. Usually it should.

## Index for the queries the product will actually run

Every list the app shows is a paginated, filtered, sorted query — and every one of those needs an index that matches its shape, or it becomes a full scan the moment the table grows past the seed. When you add a table or a field that a screen will filter or sort by (a tenant's bookings by date, a history by customer, a marketplace search by province and price), add the composite index that serves it in the same migration. Designing the access pattern and its index together is not premature optimization; it is the difference between a query that stays fast at ten thousand rows and one that quietly degrades until it pages someone at 2am. Partial indexes (`WHERE status = 'active'`) keep the hot path small when most rows are irrelevant to it.

## Prisma cannot express everything, so some migrations are written by hand

Triggers, exclusion constraints, generated ranges, extensions — Prisma's schema language does not model these. When a change needs them, hand-write the migration SQL so the guarantee exists from the first `migrate` and does not depend on a later manual step, and keep `migration_lock.toml` honest. Prisma 7 reads its connection from `prisma.config.ts` and the client uses a driver adapter — the schema has no `url`. After any schema change, regenerate the client, and if the API surface shifts, regenerate the contract.

## One writer per derived or invariant-bearing table

Some tables are only ever written through a single service — the occupancy table through `OccupancyService`, the public listing snapshot through `ListingsService`, the wallet ledger through `WalletService`, incoming bank transactions through `SepayService`, subscriptions and their invoices through `BillingService` (plus the named worker exception in `subscription-lifecycle`), cancellation responsibility through `booking_cancellations`. That is what makes their invariant auditable. When you add a table whose correctness depends on how it is written, give it one owner and route every write through it; do not scatter inserts.

## Seeds tell the truth and repeat safely

A seed is idempotent — running it twice changes nothing the second time — and it seeds the *real* flow, not shortcuts. It does not fabricate an approved-public vehicle to skip the approval path, because that would hide the path when someone tests it. It writes invariant-bearing rows through the same transactional shape the app uses.

Seeds live in `prisma/src/seed.ts` + `prisma/src/seed/`, with deterministic ids from `seedId` (upsert, never delete-and-recreate). `SEED_MODE=system` is the base data that also runs in production (permissions, roles, plans, catalog, the platform admin); `SEED_MODE=demo` adds the demo shops, owners, customers and bookings listed in `docs/qa-accounts.md`. A new demo identity goes into `prisma/src/seed/identities.ts` — `cleanup-test-data.ts` imports that list as its exclusion set, so an identity seeded anywhere else gets wiped by the next cleanup. Passwords come from env; never print them.

## Before you call it done

Apply the migration to a real database and confirm the objects you intended actually exist — the constraint, the trigger, the index — not just that `migrate` exited zero. Check for drift between schema and migration. For a new invariant, prove it rejects the bad case (a real concurrent test, not a mock — API specs run on a real PostgreSQL at `TEST_DATABASE_URL`). Re-run the seed twice and confirm the counts hold.

`prisma migrate reset` is blocked by Prisma when it detects an agent; if a reset is genuinely needed, ask the user to run it.
