# Mission Control - Chinese Study App

## Non-Optional Maintenance Rule
If you change the app in any meaningful way, you must refresh the project guidance files before you finish. Do not leave the repo with stale setup, security, or deployment docs.

At minimum, review and update these files whenever they are affected:
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `SETUP.md`
- `SETUP.local.md` if private local instructions change

If the change touches database schema, auth, sync, environment variables, deployment, backups, routing, or user setup flow, updating these docs is part of the task, not optional cleanup.

## What This Project Is
This is a single-owner Chinese study PWA with:
- spaced repetition review
- Hanzi writing practice
- a local Dexie/IndexedDB cache
- Supabase Auth and Postgres for account login and cloud sync
- Vercel deployment from GitHub

The old local PIN lock system has been removed. Do not describe it as the current architecture and do not reintroduce it casually.

## Current Architecture
- `src/main.jsx`
  Wraps the app in `AuthProvider` and `SyncProvider`.
- `src/App.jsx`
  Routes the app and gates everything behind `AuthGate`.
- `src/components/AuthGate.jsx`
  Shows the setup screen when Supabase env vars are missing and the sign-in form when auth is required.
- `src/contexts/AuthContext.jsx`
  Loads the Supabase session, signs in with email/password, signs out, and rejects unauthorized accounts.
- `src/contexts/SyncContext.jsx`
  Runs cloud sync on login, on focus, every 30 seconds, and on manual actions from Settings.
- `src/lib/supabase.js`
  Creates the client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
  It also accepts legacy `VITE_SUPABASE_ANON_KEY` as a fallback.
- `src/lib/db.js`
  Dexie schema plus local CRUD helpers. Local records carry sync metadata such as `syncId`, `updatedAt`, `dirty`, and `deletedAt`.
- `src/lib/sync.js`
  Pulls remote rows into Dexie and pushes dirty local rows back to Supabase.
- `src/lib/backup.js`
  Encrypted export and restore for the local cache using a separate backup password.
- `src/pages/SettingsPage.jsx`
  Shows account status, sync actions, backup export/import, and local data counts.
- `supabase/schema.sql`
  Public generic SQL schema with placeholder email.
- `supabase/schema.local.sql`
  Local-only, gitignored SQL schema containing the real allowed email and mirroring the current public schema.
- `SETUP.md`
  Public setup instructions.
- `SETUP.local.md`
  Local-only notes for private user-specific setup details.

## Security Model
- The app is intended for one manually created Supabase account.
- The allowed identity is enforced in Supabase, not in a public frontend env var.
- `public.app_config.allowed_email` stores the allowed email.
- `public.is_allowed_user()` looks up the authenticated Supabase user via `auth.uid()` and compares that account email to the allowed email.
- Row Level Security policies require both:
  - `public.is_allowed_user()`
  - `auth.uid() = owner_id`
- Composite foreign keys keep related rows owner-scoped, so cards, decks, and logs cannot be cross-linked across users.
- The frontend must only use the browser-safe Supabase values:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Never put a Supabase secret key or service role key in frontend code, tracked files, or Vercel env meant for the client bundle.
- The browser stores a session token after login. It should not store the user's password.
- Backups are encrypted with AES-256-GCM using a separate backup password and only contain the local study cache.
- Backups do not include Supabase auth state, session tokens, or the removed legacy PIN metadata.
- `src/lib/db.js` still contains a legacy `security` table only so old IndexedDB upgrades remain compatible. It is not the active auth system.

## Operational Rules For Agents
Treat external services as part of the implementation. If a code change also requires Supabase, Vercel, or GitHub actions, you must tell the user exactly what to do and where to click.

Examples:
- If you change database schema or RLS:
  Update `supabase/schema.sql`.
  If the private owner-specific schema also changes, update `supabase/schema.local.sql`.
  Tell the user they must rerun the SQL manually in Supabase SQL Editor.
- If you change auth or client configuration:
  Update `.env.example`, `SETUP.md`, and any setup copy shown in the UI.
  Tell the user which Vercel env vars must be changed and that a redeploy is required.
- If you change deployment behavior:
  Update `README.md` and `SETUP.md`.
  Tell the user whether GitHub, Vercel, or both need follow-up steps.
- If you change private user-specific setup:
  Update `SETUP.local.md` and any local-only files that hold private values.

Do not stop at "the code is changed" if the app will still be broken until the user updates Supabase, Vercel, or GitHub.

## Privacy Rules
- Keep tracked files generic.
- Do not commit the owner's real email, private URLs, passwords, tokens, or secret keys.
- Keep user-specific private values only in gitignored local files such as:
  - `SETUP.local.md`
  - `supabase/schema.local.sql`
- If you need to personalize setup for the owner, prefer local-only files and dashboard guidance over tracked public files.

## Deployment Reality
- GitHub is the source that Vercel deploys from.
- Supabase schema changes are manual. Editing SQL files in the repo does not update the live database automatically.
- Vercel environment variable changes require a redeploy before they affect production.
- Local development is optional for using the app, but `npm run build` should still be used to verify code changes when possible.

## Current Feature Snapshot
Working now:
- account sign-in with Supabase email/password
- single-account enforcement through Supabase schema and RLS
- deck, card, review, and writing data synced through Supabase
- local Dexie cache for normal app reads and offline-friendly behavior
- manual `Sync Now` and `Upload Local Data to Cloud` actions
- encrypted local backup export/import with a separate backup password
- mobile-friendly PWA deployment on Vercel

Still missing or incomplete:
- dictionary auto-fill
- full card edit/delete flows
- search and browse UI
- richer stats and charts
- audio playback
- more advanced conflict handling or migrations beyond the current sync model

## Quick Checks Before Finishing Work
- Run or request a build verification when code changed.
- Search for stale references to removed architecture, especially the old PIN model.
- Check whether setup docs still match the current env vars, auth flow, and deployment flow.
- Check whether the user needs manual follow-up in Supabase, Vercel, or GitHub.
