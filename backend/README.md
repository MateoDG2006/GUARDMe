# GuardMe backend

API NestJS + worker (pg-boss) + Postgres local vía Supabase CLI (solo DB).

## Requisitos

- Node (ver `.nvmrc`)
- pnpm
- Docker

## Variables de entorno

Detalle de cada clave (obligatorias, condicionales y políticas PD-*):  
[docs/environment.md](docs/environment.md).

## Arranque local

```bash
cp .env.example .env   # completar secretos (sin "replace-with")
pnpm install
pnpm db:start          # Postgres; servicios Supabase Auth/Kong apagados
pnpm db:reset          # prisma migrate reset + seed (roles, pg-boss, demo)
pnpm dev:api
pnpm dev:worker
```

### Docker Compose

Levanta Postgres + migrate/seed + API + worker. No hace falta Redis ni
Supabase Auth: Better Auth vive en la API; push/telefonía usan providers `fake`.

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

API en `http://localhost:3000`, Postgres del Compose en `localhost:54323`
(`POSTGRES_HOST_PORT` para cambiarlo). Supabase CLI sigue en `54322`; no hace
falta apagarlo para levantar Compose.

Cambios de esquema: editar `prisma/schema.prisma`, luego
`pnpm db:migrate -- --create-only --name <nombre>` y completar SQL a mano
(RLS, CHECK, índices parciales) en la migración generada.

## Tests

```bash
pnpm test
pnpm test:int
```

## Roles de base de datos

| Rol | Variable | Uso |
|---|---|---|
| `guardme_api` | `DATABASE_URL_API` | API Nest (RLS) |
| `guardme_onboarding` | `DATABASE_URL_ONBOARDING` | Flujos de onboarding |
| `guardme_ingest` | `DATABASE_URL_INGEST` | Webhooks / ingest |
| `guardme_worker` | `DATABASE_URL_WORKER` | Worker |
| `guardme_auth` | `DATABASE_URL_AUTH` | Better Auth (schema `identity`) |
| `postgres` | `DATABASE_URL_MIGRATIONS` | Solo migrate / seed / scripts |

## Autenticación (Better Auth)

Montado en `/v1/auth/*`. La app usa Bearer token.

| Ruta | Uso |
|---|---|
| `POST /v1/auth/sign-up/email` | Alta email/password |
| `POST /v1/auth/sign-in/email` | Login |
| `POST /v1/auth/sign-in/anonymous` | Sesión anónima |
| `POST /v1/auth/sign-out` | Cierra sesión Better Auth |

Después: `POST /v1/accounts/bootstrap`, `POST /v1/installations`, `GET /v1/me`.
Logout de dominio: `POST /v1/session/logout` (revoca instalaciones) y luego sign-out.

## Demo piloto

Tras `pnpm db:reset` (o `pnpm seed:demo`):

| Cuenta | Email | Password |
|---|---|---|
| Rosa | `rosa@guardme.local` | `GuardMe!rosa` |
| Ana | `ana@guardme.local` | `GuardMe!ana` |
| Dr. Pérez | `perez@guardme.local` | `GuardMe!perez` |

Bastón disponible: serial `GM-DEMO-001`, claim `GMDEM-00001`.
