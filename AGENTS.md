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
- daily-habit coaching: streaks, a composed daily session, push reminders, curated videos
- an offline CC-CEDICT dictionary with an article-mining reading mode
- Vercel deployment from GitHub

The old local PIN lock system has been removed. Do not describe it as the current architecture and do not reintroduce it casually.

## Current Architecture
- `src/main.jsx`
  Wraps the app in `AuthProvider` and `SyncProvider`.
- `src/App.jsx`
  Routes the app (including `/watch` and `/article`), gates everything behind `AuthGate`, and keeps the app-icon due-count badge in sync.
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
  Central metadata catalog for prebuilt decks (HSK 5, Economics · Core, Radicals & Components) with optional course links, plus Chinese Zero to Hero links surfaced on the Decks page.
- `src/lib/supabase.js`
  Creates the client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
  It also accepts legacy `VITE_SUPABASE_ANON_KEY` as a fallback.
- `src/lib/turnstile.js`
  Exposes the public `VITE_TURNSTILE_SITE_KEY` and loads the Cloudflare Turnstile browser script on demand for the auth screen.
- `src/lib/pleco.js`
  Builds Pleco search URLs using `plecoapi://x-callback-url/s?q=...` so both single words and full sentences open correctly, and detects whether the current device looks mobile enough to offer the live app shortcut.
- `src/lib/pinyin.js`
  Shared pinyin utility that converts numbered-tone pinyin (e.g. `ni3 hao3`) to accented pinyin (e.g. `nǐ hǎo`). Used by both the Pleco import pipeline and the display layer so all pinyin renders with proper tone marks regardless of what is stored in the database.
- `src/lib/plecoImport.js`
  Parses Pleco `.txt` exports for linked manual refresh, including Pleco's tab-separated flashcard export format with `// Section` markers, unions repeated rows into unique cards, maps one primary Pleco category to the target deck, keeps extra categories as tags, ignores suspicious category values that look like full flashcard text, and converts numbered-tone pinyin (e.g. `ni3 hao3`) to accented pinyin (e.g. `nǐ hǎo`) during import.
- `src/lib/db.js`
  Dexie schema plus local CRUD helpers. It now stores richer deck metadata, supports card browsing/editing queries, refreshes linked Pleco decks without destructive overwrites or duplicate cards across repeated device exports, bulk-deletes cards through tombstones, bulk-deletes decks by tombstoning the deck while detaching cards to standalone, and exposes recent study activity helpers alongside the sync metadata fields such as `syncId`, `updatedAt`, `dirty`, and `deletedAt`. Pleco linked refresh can also upgrade existing numbered-tone pinyin to accented pinyin when a fresh import supplies the accented version. Schema v6 adds the device-local `dict` table for the offline CC-CEDICT cache (never synced).
- `src/lib/sync.js`
  Pulls remote rows into Dexie using paginated fetches (1000 rows per page, loops until all rows retrieved), pushes dirty local rows to Supabase in batches of 500, can report cloud counts, automatically runs a full-library reconcile when local and cloud counts still disagree, treats deletions as tombstones so stale undeleted rows do not resurrect records, allows an active cloud row to heal a stale synced local tombstone, detaches active cards from deleted deck links during pull so they do not become invisible orphan records, and falls back to the legacy deck shape until the latest Supabase deck columns have been applied.
- `src/lib/backup.js`
  Encrypted export and restore for the local cache using a separate backup password.
- `src/lib/habits.js`
  Streak computation from review/writing logs, daily goal stored in Dexie meta, watch-step tracking, and 7-day activity strip data for the home dashboard.
- `src/lib/tts.js` + `src/components/SpeakButton.jsx`
  Card audio via the browser Web Speech API (free, picks the best zh voice). Used on review, writing, and article screens.
- `src/lib/push.js`
  Client side of daily Web Push reminders: fetches the VAPID public key via the `get_vapid_public_key()` RPC (no extra frontend env var), stores subscriptions in `public.push_subscriptions`, sends an end-to-end test push through the edge function, and keeps the app-icon due-count badge in sync.
- `public/push-sw.js`
  Push + notification-click handlers, merged into the generated service worker via the workbox `importScripts` option in `vite.config.js`.
- `src/lib/dict.js`
  Offline CC-CEDICT dictionary: downloads ~8 MB from jsDelivr on demand into the Dexie `dict` table (schema v6, device-local, never synced). Powers Add Card auto-fill, article segmentation (greedy longest match), and word lookups.
- `src/data/econ1.js` / `src/data/radicals.js`
  Prebuilt deck content: Economics · Core (economics and finance vocabulary; the owner is an economist) and Radicals & Components (radical forms with Chinese radical names and example characters for reading skill).
- `src/data/videos.js`
  Watch-tab content: verified YouTube channels (SyS Mandarin, Chinese Zero to Hero, Grace Mandarin Chinese, ShuoshuoChinese), stable channel-search shortcuts by topic (songs, stories, news/economy, characters), an optional fresh-videos list meant to be refreshed by the weekly content task via channel RSS feeds, and a deterministic daily pick.
- `src/pages/WatchPage.jsx`
  Curated video hub with topic chip filters. Opening any link marks the watch step of Today's Session as done.
- `src/pages/ArticlePage.jsx`
  Reading tool: paste Chinese text, segment against CC-CEDICT plus the user's own cards, show known/new/coverage stats, tap a word for definitions, TTS, Pleco, and one-tap card creation into a chosen deck.
- `supabase/functions/send-due-push/index.ts`
  Edge function sending the daily "cards due" Web Push. Auth: pg_cron caller must present `x-cron-secret` matching `public.push_private.cron_secret`; the in-app test button authenticates as the allowed user via JWT. Deployed with verify_jwt=false because auth is enforced inside the function.
- `src/pages/HomePage.jsx`
  Dashboard with the Today's Session habit card (streak pill, daily goal bar, three-step session: capped review / writing / daily video, 7-day strip), stats, recent activity, and deck focus cards.
- `src/pages/CardsPage.jsx`
  Library browser with search, deck/status filters, lightweight card editing including deck reassignment, and bulk card selection/deletion.
- `src/pages/DecksPage.jsx`
  Deck management view with custom deck creation, per-deck summaries, prebuilt repair (now including Economics · Core and Radicals & Components), CZH course links, direct browse/review actions, and bulk deck cleanup that preserves cards as standalone.
- `src/pages/AddCardPage.jsx`
  Card creation form with deck assignment at save time and dictionary auto-fill (pinyin + meaning from the offline CC-CEDICT cache, on blur or via button).
- `src/pages/SettingsPage.jsx`
  Shows account status, daily reminder (push) enable/disable/test, daily goal, offline dictionary download/remove, sync actions, one-device cloud repair, Pleco linked refresh, backup export/import, and local/cloud data counts.
- `src/pages/ReviewPage.jsx`
  SRS review with optional `?limit=N` session cap that reserves slots for never-reviewed cards, adaptive font sizing for long words/sentences, TTS pronunciation, and Pleco lookup.
- `supabase/schema.sql`
  Public generic SQL schema with placeholder email, owner-scoped sync tables, deck metadata columns, server-side sync guards, and the push notification section (push_private, push_subscriptions, get_vapid_public_key, pg_cron/pg_net with a commented schedule block).
- `supabase/schema.local.sql`
  Local-only, gitignored SQL schema containing the real allowed email and mirroring the current public schema, plus notes on the already-applied live push setup.
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
- Push notification security:
  - `public.push_private` holds the VAPID key pair and the cron secret. RLS is enabled with no policies and anon/authenticated grants are revoked, so only the service role (edge function) and postgres (pg_cron) can read it. These values live only in the live database, never in tracked files.
  - The VAPID public key is not a secret and is exposed to the signed-in allowed user via `public.get_vapid_public_key()`.
  - `public.push_subscriptions` uses the same RLS pattern as the sync tables (is_allowed_user + owner check) plus a delete policy so devices can unsubscribe.
  - The `send-due-push` edge function is deployed with verify_jwt=false but enforces auth internally: cron secret header or allowed-user JWT. Do not weaken that check.

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
- If you change the edge function:
  Update `supabase/functions/send-due-push/index.ts` in the repo AND redeploy the function to Supabase (they do not deploy automatically from the repo).

Do not stop at "the code is changed" if the app will still be broken until the user updates Supabase, Vercel, or GitHub.

## Privacy Rules
- Keep tracked files generic.
- Do not commit the owner's real email, private URLs, passwords, tokens, or secret keys.
- VAPID private key and cron secret live only in `public.push_private` in the live database.
- Keep user-specific private values only in gitignored local files such as:
  - `SETUP.local.md`
  - `supabase/schema.local.sql`
- If you need to personalize setup for the owner, prefer local-only files and dashboard guidance over tracked public files.

## Deployment Reality
- GitHub is the source that Vercel deploys from.
- Supabase schema changes are manual. Editing SQL files in the repo does not update the live database automatically.
- Supabase edge functions are deployed separately (dashboard, CLI, or MCP); the repo copy is the source of truth for their code.
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
- Pleco search deep-link from active review and writing sessions on mobile, using the search endpoint so both single words and full sentences open correctly in Pleco
- manual Pleco `.txt` linked refresh that unions unique cards across repeated exports, fills missing pinyin or meaning when possible, reads Pleco's tab-separated export plus `// Section` markers correctly, keeps extra Pleco categories as tags instead of duplicating cards, ignores suspicious category values that would otherwise create bogus empty decks, converts numbered-tone pinyin to accented pinyin during import, and upgrades existing numbered-tone pinyin on matching cards when a fresh import provides accented versions
- card meaning text on review and writing screens uses a compact font with scrollable overflow so long Pleco definitions fit without breaking the layout
- paginated cloud fetches so sync works correctly beyond Supabase's default 1000-row response limit
- batched cloud pushes (500 rows per request) to avoid timeout on large upserts
- review queue orders already-reviewed SRS cards by due date (oldest first) and never-reviewed cards by most recently added first (LIFO) so new imports surface quickly
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
- Today's Session habit card: streak counter, daily goal progress bar, capped review session (`/review?limit=N`) that reserves slots for never-reviewed cards, writing step, daily video pick, and a 7-day activity strip
- daily Web Push reminders via `send-due-push` edge function + pg_cron (05:30 UTC), with in-app enable/disable and end-to-end test button, plus an app-icon due-count badge
- Watch tab with verified channels and topic shortcuts (songs, stories, news/economy, characters) and a deterministic daily pick that feeds Today's Session
- offline CC-CEDICT dictionary (on-demand ~8 MB download into Dexie) powering Add Card auto-fill and Article Mode
- Article Mode reading tool: segmentation, known/new coverage stats, tap-to-lookup, and one-tap card creation
- prebuilt Economics · Core and Radicals & Components decks alongside HSK 5, each with course/video links where relevant
- TTS audio on review, writing, and article screens via the Web Speech API
- adaptive font sizing on review cards so long words and sentences fit

Still missing or incomplete:
- fresh specific-video rotation in the Watch tab (channel shortcuts are stable; the weekly content task should append real video entries to `WATCH_VIDEOS` via channel RSS feeds)
- richer bulk card actions and deeper card editing for examples/history
- richer stats and charts beyond the streak/goal view (e.g. heatmap calendar, retention curves)
- premium TTS voices (current audio uses the device's built-in zh voices)
- more advanced conflict handling or migrations beyond the current sync model
- deeper CZH integration (importing full CZH word lists per level; currently deep links only)

## Quick Checks Before Finishing Work
- Run or request a build verification when code changed.
- Search for stale references to removed architecture, especially the old PIN model.
- Check whether setup docs still match the current env vars, auth flow, and deployment flow.
- Check whether the Supabase Auth hardening guidance still matches the current dashboard controls for password rate limits or bot protection.
- Check whether the user needs manual follow-up in Supabase, Vercel, or GitHub.
- If the edge function code changed, confirm the deployed version on Supabase matches the repo copy.
