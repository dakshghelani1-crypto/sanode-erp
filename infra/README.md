# Deployment baseline

Deploy the web and API containers separately. Keep PostgreSQL, Redis, and object storage managed rather than running them inside application containers.

## Environments

| Environment | Purpose | Database rule |
| --- | --- | --- |
| Development | Local feature work | Disposable local database |
| Staging | Acceptance and migration rehearsal | Production-like data shape, no live customer data |
| Production | Daily warehouse operations | Managed PostgreSQL, point-in-time recovery, encrypted backups |

## Non-negotiable controls

- Run database migrations once per release, before API rollout.
- Run `pnpm db:deploy` in the release job; never run the development migration command against production.
- Store secrets in the deployment platform’s secret manager; never in repository files.
- Require HTTPS, database encryption at rest, daily backups, and quarterly restore tests.
- Send application errors and audit-log delivery failures to monitoring.
- Restrict production database access to the API service and break-glass administrators.

## Container build commands

Build from the repository root:

```sh
docker build -f apps/api/Dockerfile -t sanode-api .
docker build -f apps/web/Dockerfile -t sanode-web .
```

The platform should begin as a modular monolith: one API deployment, one web deployment, a database, and a queue. Split services only when operational scale or independent release requirements justify it.
