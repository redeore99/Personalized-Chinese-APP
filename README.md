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
- The app now has a dedicated card-library screen for search, filtering, and lightweight editing.
- Home now shows recent review and writing activity plus deck-level focus summaries.
- Review and writing screens can deep-link the current word into Pleco on mobile.
- Auth session validation is deferred outside Supabase auth-event callbacks to avoid client deadlocks during session restore.
- If a device has more local study data than the cloud and has never done a full migration upload, the sync layer now auto-promotes that fuller local library once.
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
- If app behavior changes, the project guidance files should be refreshed so future sessions inherit the correct architecture.
- This app now has deck metadata columns in Supabase. If you deploy the latest code, rerun the latest schema SQL before relying on cross-device deck organization.

## Development
```bash
npm install
npm run dev
npm run build
npm run preview
```
