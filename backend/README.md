# Water Quality API (backend)

NestJS API with **clean architecture** + **Prisma 7** + **PostgreSQL**, Dockerized the same way as Work Force Management.

## Layout

```
src/
  domain/              # entities, repository contracts
  application/         # use cases
  infrastructure/
    config/            # configuration + env validation
    database/prisma/   # PrismaService, repositories
  presentation/        # Nest modules / controllers
prisma/
  schema.prisma
  migrations/
docker/
  entrypoints/         # development | migrate | production
  postgres/init/       # grants on first boot
```

## Environment

See [`.env.example`](.env.example):

| Variable | Purpose |
| --- | --- |
| `API_PORT` | Host port for Docker API (`docker:dev`) → container `:3000` |
| `PORT` | Host Nest port for `start:dev` / `dev:local` |
| `POSTGRES_*` | Postgres credentials + published port |
| `DATABASE_URL` | Host → Postgres (Prisma CLI / local Nest) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `JWT_SECRET` | JWT signing secret (min 16 chars in prod) |
| `SYSTEM_ADMIN_EMAIL` / `SYSTEM_ADMIN_PASSWORD` | Default seeded SYSTEM_ADMIN |

## Roles

| Role | Label |
| --- | --- |
| `SYSTEM_ADMIN` | Administrator — user provisioning, credentials, audit, access control |
| `SUPER_ADMIN` | PRMSC Manager |
| `USER` | PCRWR User |

Default SYSTEM_ADMIN (after migrate/seed): `system.admin@prmsc.gov.pk` / `ChangeMe@123`

## Auth & admin API

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Public |
| `GET` | `/api/auth/me` | Authenticated |
| `GET/POST` | `/api/admin/users` | SYSTEM_ADMIN |
| `PATCH` | `/api/admin/users/:id` | SYSTEM_ADMIN |
| `PATCH` | `/api/admin/users/:id/status` | SYSTEM_ADMIN |
| `POST` | `/api/admin/users/:id/reset-password` | SYSTEM_ADMIN |
| `GET` | `/api/admin/audit-logs` | SYSTEM_ADMIN |
| `GET` | `/api/admin/access-control` | SYSTEM_ADMIN |

Inside Compose, `DATABASE_URL` is overridden to use hostname `postgres`.

## Run with Docker (recommended)

```bash
npm run docker:dev
```

Startup: `postgres` healthy → `migrate` (`prisma migrate deploy` + seed) → `api` (hot-reload).

- API: http://localhost:3003/api
- Health: http://localhost:3003/api/health
- Postgres: `localhost:5436`

```bash
npm run docker:dev:down
npm run docker:dev:logs
```

## Local Nest (DB still in Docker)

```bash
npm run docker:db
npm run prisma:deploy
npm run db:seed
npm run start:dev
```

Or: `npm run dev:local` (deploy + seed + watch).

API listens on `PORT` (default `3002`).

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate   # create/apply in dev
npm run prisma:deploy   # apply pending migrations
npm run prisma:studio
npm run db:seed
```

## Production

Orchestration lives at the **repo root** (`docker-compose.prod.yml`). See [`../deploy/DEPLOYMENT.md`](../deploy/DEPLOYMENT.md).
