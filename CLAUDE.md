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
  Shows the setup screen when Supabase env vars are missing and the sign-in form when auth is required, including the Cloudflare Turnstile widget used before password sign-in.
- `src/components/TurnstileWidget.jsx`
  Loads and renders the Cloudflare Turnstile widget on the sign-in screen and resets it after failed sign-in attempts.
- `src/components/PlecoLookupButton.jsx`
  Renders the shared "Open in Pleco" control for study flows and shows a desktop hint when the device is not mobile.
- `src/contexts/AuthContext.jsx`
  Loads the Supabase session, signs in with email/password plus Supabase CAPTCHA token support, signs out, rejects unauthorized accounts, defers Supabase auth-event work outside the auth callback to avoid deadlocks, and applies a device-local cooldown after repeated failed password attempts.
- `src/contexts/SyncContext.jsx`
  Runs cloud sync on login, on focus, every 30 seconds, restores saved sync timestamps, and exposes both the normal manual sync/reconcile action and a one-device "replace from cloud" recovery action from Settings.
- `src/lib/deckCatalog.js`
  Central metadata catalog for prebuilt decks such as HSK 5.
- `src/lib/supabase.js`
  Creates the client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
  It also accepts legacy `VITE_SUPABASE_ANON_KEY` as a fallback.
- `src/lib/turnstile.js`
  Exposes the public `VITE_TURNSTILE_SITE_KEY` and loads the Cloudflare Turnstile browser script on demand for the auth screen.
- `src/lib/pleco.js`
  Builds Pleco deep-link URLs and detects whether the current device looks mobile enough to offer the live app shortcut.
- `src/lib/plecoImport.js`
  Parses Pleco `.txt` exports for linked manual refresh, including Pleco's tab-separated flashcard export format with `// Section` markers, unions repeated rows into unique cards, maps one primary Pleco category to the target deck, keeps extra categories as tags, and ignores suspicious category values that look like full flashcard text.
- `src/lib/db.js`
  Dexie schema plus local CRUD helpers. It now stores richer deck metadata, supports card browsing/editing queries, refreshes linked Pleco decks without destructive overwrites or duplicate cards across repeated device exports, bulk-deletes cards through tombstones, bulk-deletes decks by tombstoning the deck while detaching cards to standalone, and exposes recent study activity helpers alongside the sync metadata fields such as `syncId`, `updatedAt`, `dirty`, and `deletedAt`.
- `src/lib/sync.js`
  Pulls remote rows into Dexie, pushes dirty local rows to Supabase, can report cloud counts, automatically runs a full-library reconcile when local and cloud counts still disagree, treats deletions as tombstones so stale undeleted rows do not resurrect records, allows an active cloud row to heal a stale synced local tombstone, detaches active cards from deleted deck links during pull so they do not become invisible orphan records, and falls back to the legacy deck shape until the latest Supabase deck columns have been applied.
- `src/lib/backup.js`
  Encrypted export and restore for the local cache using a separate backup password.
- `src/pages/HomePage.jsx`
  Dashboard with due counts, today activity, recent review/writing history, and deck focus cards.
- `src/pages/CardsPage.jsx`
  Library browser with search, deck/status filters, lightweight card editing including deck reassignment, and bulk card selection/deletion.
- `src/pages/DecksPage.jsx`
  Deck management view with custom deck creation, per-deck summaries, prebuilt repair, direct browse/review actions, and bulk deck cleanup that preserves cards as standalone.
- `src/pages/AddCardPage.jsx`
  Card creation form with deck assignment at save time.
- `src/pages/SettingsPage.jsx`
  Shows account status, sync actions, one-device cloud repair, Pleco linked refresh, backup export/import, and local/cloud data counts.
- `supabase/schema.sql`
  Public generic SQL schema with placeholder email, owner-scoped sync tables, deck metadata columns, and server-side sync guards that protect newer tombstones and newer `updated_at` values.
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
- The frontend may also use the public Turnstile site key:
  - `VITE_TURNSTILE_SITE_KEY`
- Never put a Supabase secret key or service role key in frontend code, tracked files, or Vercel env meant for the client bundle.
- Never put the Cloudflare Turnstile secret key in frontend code, tracked files, or browser env vars.
- The browser stores a session token after login. It should not store the user's password.
- The sign-in UI now requires Cloudflare Turnstile and adds a device-local cooldown after repeated failed password attempts, but Supabase CAPTCHA and auth protections must still stay enabled because the real attack surface is the server endpoint.
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
- Cloudflare Turnstile on the sign-in screen with Supabase CAPTCHA token support
- single-account enforcement through Supabase schema and RLS
- deck, card, review, and writing data synced through Supabase
- local Dexie cache for normal app reads and offline-friendly behavior
- structured deck metadata for custom vs prebuilt organization
- card browse/search/edit UI with deck reassignment
- bulk card deletion from the library browser
- manual cards can be filed into a deck on creation
- home dashboard recent activity and deck focus summaries
- deck-specific browse/review entry points
- bulk deck deletion that preserves cards as standalone for safer cleanup
- Pleco deep-link lookup from active review and writing sessions on mobile
- manual Pleco `.txt` linked refresh that unions unique cards across repeated exports, fills missing pinyin or meaning when possible, reads Pleco's tab-separated export plus `// Section` markers correctly, keeps extra Pleco categories as tags instead of duplicating cards, and ignores suspicious category values that would otherwise create bogus empty decks
- manual `Sync Now` with automatic full reconcile when counts drift
- cloud vs local counts visible in Settings for sync troubleshooting
- one-device "replace from cloud" recovery for browsers whose local cache is stuck behind the canonical cloud data
- sync repair for cards that still point at deleted decks, so they reappear as standalone instead of hiding from deck views
- sync repair for stale synced local tombstones so an active cloud copy can pull back down when appropriate
- prebuilt deck repair when a device has only a partial local import
- encrypted local backup export/import with a separate backup password
- browser-local cooldown after repeated failed sign-in attempts
- mobile-friendly PWA deployment on Vercel
- eager PWA update registration so installed mobile builds refresh more reliably

Still missing or incomplete:
- dictionary auto-fill
- richer bulk card actions and deeper card editing for examples/history
- richer stats and charts beyond the new dashboard activity view
- audio playback
- more advanced conflict handling or migrations beyond the current sync model

## Quick Checks Before Finishing Work
- Run or request a build verification when code changed.
- Search for stale references to removed architecture, especially the old PIN model.
- Check whether setup docs still match the current env vars, auth flow, and deployment flow.
- Check whether the Supabase Auth hardening guidance still matches the current dashboard controls for password rate limits or bot protection.
- Check whether the user needs manual follow-up in Supabase, Vercel, or GitHub.
