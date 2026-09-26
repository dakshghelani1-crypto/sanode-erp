# Sanode Operations Platform

Batch-aware pharmaceutical inventory, dispatch, trade schemes, and MR sample accounting.

## Architecture

- `apps/web` — Next.js operational workspace for warehouse, sales, and MR teams.
- `apps/api` — NestJS API that owns authorization, validation, FEFO allocation, and audit records.
- `packages/domain` — shared unit-conversion and inventory-domain rules.
- PostgreSQL — transactional source of truth; product and batch balances are maintained only by server-side transactions.
- Redis — reserved for scheduled expiry alerts, exports, and notification jobs.

The former static prototype remains in the repository root as a visual reference while the new platform is developed under `apps/`.

## Inventory invariants

1. Strips are the atomic stock unit; boxes are converted using the product pack rule.
2. A product’s balance is the aggregate of its active batches.
3. Every outward movement allocates non-expired, non-quarantined batches by earliest expiry first.
4. A commercial order stores billed strips and free-goods strips separately; both reduce physical stock.
5. MR samples create their own ledger type and never count as commercial revenue.
6. The ledger is append-only. Corrections create reversal or adjustment entries rather than editing history.

## Local setup

1. Install Node.js 22+ and pnpm 10+.
2. Copy `.env.example` to `.env`.
3. Start PostgreSQL and Redis with `docker compose up -d`.
4. Run `pnpm install`.
5. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm --filter api prisma:seed`.
6. Run `pnpm dev`.

For staging or production, use `pnpm db:deploy` during the release before starting the API; do not use the interactive development migration command.

Web: `http://localhost:3000`  
API health: `http://localhost:4000/v1/health`

## Delivery sequence

1. Database migration, seeded admin login, and organization-scoped authentication are ready.
2. Product and batch receipt workflows are ready, including duplicate-safe idempotency.
3. Transactionally safe FEFO dispatch, schemes, and MR samples are ready; returns and adjustments are the next controlled workflows.
4. Warehouse-friendly screens, printing, exports, and historical data migration should be completed in staging before go-live.
5. Production requires staging smoke tests, backups, monitoring, and a restore rehearsal.

The seed creates `admin@sanode.local`. Set `SEED_ADMIN_PASSWORD` before running the seed and change it before any real deployment. The browser uses an HTTP-only session cookie; inventory endpoints also accept a bearer token for integrations.

## Production deployment requirements

Use separate dev, staging, and production environments; managed PostgreSQL with point-in-time recovery; secrets management; encrypted object storage; audit-log retention; and independent restore testing. Do not use browser storage as the source of truth.
