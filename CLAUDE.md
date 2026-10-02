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
- The app needs a development build (MapLibre is native): `npx expo run:ios`; Expo Go no longer works. Never build with CODE_SIGNING_ALLOWED=NO (breaks Keychain/SecureStore). See docs/08.
- Server data in the app goes through TanStack Query hooks (`hooks/use-*.ts`), never raw fetch in screens.
- All UI text goes through i18n (`t('…')`, keys in `apps/mobile/src/i18n/locales/{et,en,ru}.json`); Estonian is the source and fallback, Figma copy in `docs/figma/copy-et.json`. Never hard-code visible text in `apps/mobile/src` (`npm run i18n:check` fails). Numbers/dates via `lib/format.ts`, counted nouns via plural keys. See docs/11-tolked-ja-figma.md.
- API/validation messages are keys in `packages/shared/src/i18n/{et,en,ru}.ts`: `throw new NotFoundError('errors.x')`, schemas use `issueMessage('validation.x')`; the error handler translates per `Accept-Language`, logs stay English.
- Blocks hide users in both directions everywhere: every social query uses `modules/safety/block-sql.ts`. Side effects for other users (feed row, socket event, push) go through `Notifier`, never directly; pushes are queued (BullMQ), texts in the recipient's `user.language`. See docs/12-kogukond.md.
- Rules that must hold under concurrency live in the database (unique/partial indexes, CHECK, the `bookings_no_overlap` EXCLUDE constraint); the service checks them too for a friendly message and maps `isUniqueViolation` / `isExclusionViolation` to 409. Booking time rules are pure functions in `modules/bookings/booking-rules.ts`. No payments anywhere. See docs/13-teenused.md.
- Motion and accessibility (docs/14): animate through `lib/motion.ts` tokens and the shared components (`PressableScale`, `Entering`, `SkeletonList`, `EmptyState`, `ErrorState`, `SuccessMark`); every animation respects `useReduceMotion()`. Haptics only via `haptic(reason)` from `lib/haptics.ts`. Every touchable has `accessibilityRole` + `accessibilityLabel` (`npm run a11y:check` fails otherwise); no fixed heights/widths on text containers (Dynamic Type, long Russian labels). Never put an Intl month/weekday after a preposition in et/ru — use a label form ("Tähtaeg: …") or a numeric date.
- Packaging and production (docs/15): a new API env var goes into `config/env.ts` (production rule in `productionConfigProblems` if it has a localhost default), `apps/api/.env.example`, `apps/api/.env.production.example` and the docs/15 table. The production image runs the esbuild bundle (`npm run build -w @kapp/api`), not tsx — keep imports static and declare every runtime package in `apps/api/package.json` dependencies (the image prunes everything else; CI's `docker` job starts it and checks `/health`). Migrations run as a separate step (`node dist/migrate.js`), never on boot. New long-lived connections need a shutdown step in `index.ts`. Never log query strings, IPs or email addresses. App build config lives in `apps/mobile/eas.json` + `app.json`; `app.config.ts` only validates release builds.
- Code, identifiers and comments are English.

Before finishing: `npm run typecheck && npm test`, `npm run lint -w mobile`, `npm run i18n:check` and `npm run a11y:check`.
