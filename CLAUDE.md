# Käpp (ICD0018) — notes for coding agents

Monorepo (npm workspaces): `apps/mobile` (Expo SDK 57), `apps/api` (Fastify 5 + Drizzle + PostGIS), `packages/shared` (Zod schemas, types, Figma tokens).

Read before changing code:
- `docs/06-koodistandard.md` — folder/naming rules and the reason for each, the error contract, security and test requirements. Follow it; justify any deviation in a code comment.
- `apps/mobile/AGENTS.md` — Expo-specific rules (use `npx expo install`, check versioned docs).

Rules that are easy to miss:
- API errors are always `{ error: true, message }`; throw `HttpError` subclasses, never hand-build error replies.
- Validate every body/query/params with `parseRequest` and a schema from `packages/shared`; body schemas are `.strict()`.
- New API feature = `modules/<domain>/<domain>.{routes,service,repository}.ts` + unit, HTTP and (for SQL) integration tests.
- DB changes: edit `apps/api/src/db/schema.ts`, then `npm run db:generate -w @kapp/api`; never edit merged migrations.
- Auth: Better Auth behind `/api/v1/auth/*` (see docs/07-autentimine.md); protected routes use `requireUser`; the app sends the session cookie via `lib/api.ts`.
- UI text is Estonian; code, identifiers and comments are English.

Before finishing: `npm run typecheck && npm test` and `npm run lint -w mobile`.
