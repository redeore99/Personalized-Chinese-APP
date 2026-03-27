# Personalized Chinese App

A single-owner Chinese study PWA with spaced repetition review, Hanzi writing practice, Supabase account auth, cloud sync, and a local Dexie cache for fast browser storage.

## Current Stack
- React 18 + Vite 6
- React Router v6 with `HashRouter`
- Dexie.js for local IndexedDB storage
- Supabase Auth + Postgres + Row Level Security
- HanziWriter for writing practice
- Vercel for deployment from GitHub

## Important Architecture Notes
- The app no longer uses the old local PIN lock model.
- Supabase auth is the entry point to the app.
- Supabase stores the canonical cloud data.
- Dexie remains the local cache and offline-friendly layer.
- Decks now carry structured metadata such as `slug`, `kind`, `sourceKey`, `description`, `color`, and `sortOrder` so the library can grow beyond a flat deck-name list.
- Manual cards can be assigned directly to a deck at creation time and moved later from the new library browser.
- The app now has a dedicated card-library screen for search, filtering, lightweight editing, and bulk card deletion.
- The decks screen now supports bulk deck cleanup too. Deleting a deck keeps its cards as standalone cards instead of deleting study data.
- Home now shows recent review and writing activity plus deck-level focus summaries.
- Review and writing screens can deep-link the current word into Pleco on mobile.
- Settings can now manually import or refresh Pleco `.txt` exports. Repeated refreshes union unique cards, avoid duplicates across repeated device exports, preserve existing local study data, keep extra Pleco categories as tags when the same card appears in multiple categories, and ignore suspicious “category” values so full flashcard text does not turn into bogus empty decks.
- The installed PWA now registers updates eagerly and reloads when a new service worker takes control, so mobile should pick up fresh deployments more reliably.
- Auth session validation is deferred outside Supabase auth-event callbacks to avoid client deadlocks during session restore.
- The sign-in form now requires a Cloudflare Turnstile check and still applies a device-local cooldown after repeated failed password attempts. Keep Supabase CAPTCHA enabled too, since that is the server-side defense that actually verifies the token.
- `Sync Now` is now a single smart reconcile action: it pulls cloud changes, pushes local changes, and automatically runs a full-library repair pass if counts still differ.
- Card and deck deletions sync as tombstones, so a stale undeleted copy on another device should no longer resurrect deleted records during sync.
- Supabase now also protects sync updates server-side, so older writes should not overwrite newer tombstones or newer `updated_at` values after the latest SQL is applied.
- Local card deletion now verifies that the Dexie tombstone write succeeded before the UI reports success.
- Prebuilt decks can now be repaired in-place if a device has only a partial local import.
- The sync layer can fall back to the legacy deck shape if Supabase has not been upgraded yet, but deck metadata sync is only complete after rerunning the latest SQL.
- Encrypted backups use a separate backup password and are still useful as an extra recovery path.

## Setup
- Public setup guide: [SETUP.md](/C:/Users/pablo/Desktop/Personalized%20Chinese%20APP/SETUP.md)
- Private local notes: `SETUP.local.md` and `supabase/schema.local.sql`
- If you keep a private local schema, keep it aligned with `supabase/schema.sql` and only swap in the real allowed email locally.

Tracked files stay generic on purpose. Private owner-specific values should stay in local ignored files and in the Supabase or Vercel dashboards.

## Operational Reality
- GitHub push updates the source Vercel deploys from.
- Supabase SQL files do not apply themselves automatically. Schema changes must be run manually in Supabase SQL Editor.
- Vercel environment variable changes require a redeploy.
- Cloudflare Turnstile now protects the login form. The browser uses the public site key, while the secret key stays only in Cloudflare and Supabase dashboard settings.
- Pleco sync is manual and file-based on purpose. Export a `.txt` file from Pleco whenever needed, then refresh from that file inside the app.
- If app behavior changes, the project guidance files should be refreshed so future sessions inherit the correct architecture.
- This app now has deck metadata columns in Supabase. If you deploy the latest code, rerun the latest schema SQL before relying on cross-device deck organization.

## Development
```bash
npm install
npm run dev
npm run build
npm run preview
```
