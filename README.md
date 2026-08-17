# Water Quality — Version 2

Baseline scaffold aligned with Work Force Management architecture.

```
.
├── docker-compose.prod.yml
├── .env.prod.example
├── Makefile
├── deploy/
├── backend/          NestJS (clean architecture) + Prisma 7 + PostgreSQL
└── frontend/webapp/  React (Vite) + shadcn/ui
```

## Prerequisites

- Node.js 22+
- Docker Desktop

## Local development

### Backend (Dockerized API + Postgres)

```bash
cd backend
cp .env.example .env   # if needed
npm install
npm run docker:dev
```

| Endpoint | URL |
| --- | --- |
| API | http://localhost:3003/api |
| Health | http://localhost:3003/api/health |
| Postgres | localhost:5436 |

Startup gate: `postgres` healthy → `migrate` (prisma migrate deploy) → `api`.

### Backend (host Nest + Docker DB only)

```bash
cd backend
npm run docker:db
npm run prisma:deploy
npm run db:seed
npm run start:dev   # PORT=3002
```

### Frontend

```bash
cd frontend/webapp
cp .env.example .env   # VITE_API_PROXY_TARGET=http://localhost:3003
npm install
npm run dev
```

App: http://localhost:5173

Vite proxies `/api` → `VITE_API_PROXY_TARGET`. For local Nest on `3002`, point that target at `http://localhost:3002`.

## Production

```bash
cp .env.prod.example .env
make up
make health
```

See [`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md).
