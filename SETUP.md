# Chinese Study App Setup Guide

This app now uses Supabase for login and cloud sync. The public repo stays generic on purpose, so private owner-specific values should live only in local ignored files and in the Supabase or Vercel dashboards.

Public files:
- `.env.example`
- `supabase/schema.sql`
- `SETUP.md`

Private local files:
- `SETUP.local.md`
- `supabase/schema.local.sql`

If you keep a private local schema, keep it structurally aligned with the latest
`supabase/schema.sql`. Only the allowed email should stay different.

## What Lives Where
- GitHub stores the code.
- Vercel deploys the app from GitHub.
- Supabase stores the account and synced study data.
- Dexie/IndexedDB stores the local browser cache.
- Encrypted backups store a portable offline copy of the local cache.
- Pleco deck refresh is file-based. Export a `.txt` file from Pleco whenever needed, then refresh from that file in the app.

## First-Time Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/schema.local.sql` if you want to keep the real allowed email out of the public repo.
4. If you do not use the local-only file, replace the placeholder email in `supabase/schema.sql` and run that instead.
5. In Supabase Auth settings, keep email/password enabled.
6. Disable public signups.
7. In Cloudflare Dashboard -> Turnstile, create a widget for this app and allow your production Vercel domain plus `localhost` if you want local development.
8. Copy the Turnstile `Site key` and `Secret key`.
9. In Supabase Dashboard -> Authentication, open the CAPTCHA or bot-protection settings, enable CAPTCHA, choose Cloudflare Turnstile, and paste the Turnstile secret there. If the current dashboard also asks for the site key, paste that too.
10. Review the current Supabase password rate-limit or bot-protection controls and keep them enabled. The app now adds a browser-local cooldown after repeated failures, but Supabase still needs to be the real brute-force defense.
11. Manually create the one allowed user account and give it a long unique password.
12. In Supabase Settings -> API Keys, copy the `Publishable key`.
13. Build the project URL as `https://<project-ref>.supabase.co` or copy it from Supabase project settings.
14. In Vercel Project Settings -> Environment Variables, add:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

15. Save the Vercel env vars and redeploy.
16. If you develop locally, also add `VITE_TURNSTILE_SITE_KEY` to `.env.local`.
17. Open the deployed app and sign in with the manually created account.
18. On each older browser that already has local study data, sign in there too and run `Sync Now`. The latest app will automatically do a deeper full-library reconcile if local and cloud counts still disagree.
19. If you deploy the latest library-management and sync-hardening update, rerun the latest schema SQL in Supabase so the new deck metadata columns (`slug`, `description`, `kind`, `source_key`, `color`, `sort_order`) and the server-side sync-protection triggers are applied before you rely on cross-device organization and deletion sync.

## Using Pleco Deck Import
1. In Pleco flashcards, export the cards you want as a `.txt` file.
2. Save that file somewhere your phone or computer can open.
3. In the app, open `Settings`.
4. Use `Import / Refresh From Pleco` and choose the exported `.txt` file.
5. The refresh is manual, linked, and additive:
   - Missing linked Pleco decks are created automatically when new cards need them.
   - Existing matching linked or custom decks are refreshed instead of duplicated.
   - Repeated refreshes skip duplicates and can fill in missing pinyin or meaning on existing cards.
   - Cards are never deleted just because they are missing from a later Pleco export.
   - Pleco's tab-separated `.txt` export is now parsed directly, so semicolons inside long definitions no longer get mistaken for separators.
   - Lines like `// Dictionary`, `// Sentences`, and `// Jwl` become linked deck names when they are present in the Pleco export.
   - If the same Pleco card appears in multiple categories, the app keeps one card, uses one primary deck, and stores the extra Pleco categories as tags.
   - If a supposed Pleco category looks like full flashcard text instead of a real deck name, the app now ignores that category and falls back to the shared `Pleco Import` deck rather than creating bogus empty decks.
6. Run `Sync Now` if you want the refreshed cards uploaded to Supabase for your other devices.

## Managing Cards And Decks
- Cards
  In `Cards`, use `Select` to choose visible cards and `Delete Selected` to remove them in one batch.
  Bulk card deletion uses the same sync tombstone path as single-card deletion, so the deletion can propagate safely to your other devices.
- Decks
  In `Decks`, use `Select` and then `Delete Selected` to remove multiple decks at once.
  Deleting a deck does not delete the cards inside it. Those cards stay in your library as standalone cards so study data is not lost.
  `Select Empty` is the fastest cleanup path if a bad Pleco import created empty decks.

## Optional Local Development
Local development is not required just to use the deployed app, but it is useful when making or testing code changes.

```bash
npm install
npm run dev
npm run build
```

## Ongoing Maintenance
These external systems matter after code changes:

- Supabase
  If schema, RLS, or account rules change, update the SQL file and rerun the SQL manually in Supabase.
- Vercel
  If env vars or deployment behavior change, update the env vars in Vercel and redeploy.
- GitHub
  Vercel deploys from GitHub, so the latest code must be pushed before a new deployment can pick it up.

## When Future Changes Require Manual Dashboard Work
- Database changes
  Update `supabase/schema.sql`.
  If the private owner-specific version also changed, update `supabase/schema.local.sql`.
  Then rerun the SQL in Supabase SQL Editor.
- Auth or env changes
  Update `.env.example`, `SETUP.md`, and any setup copy in the app UI.
  Then update the matching Vercel environment variables and redeploy.
- Private identity changes
  Update only local ignored files such as `SETUP.local.md` and `supabase/schema.local.sql`, then rerun the SQL in Supabase.

## Security Notes
- The frontend should only use the browser-safe Supabase values:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- The frontend can also safely use the public Turnstile site key:
  - `VITE_TURNSTILE_SITE_KEY`
- Never use the Supabase secret key or service role key in this frontend app.
- Never put the Turnstile secret key in frontend code, tracked files, or browser env vars.
- The browser stores a session token after login, not the user's password.
- The sign-in screen now requires Cloudflare Turnstile and still adds a device-local cooldown after repeated failed password attempts, but that local cooldown is only a speed bump. Supabase CAPTCHA and auth protections should stay enabled because the real attack surface is the server endpoint.
- Encrypted backups use a separate backup password and do not replace account security.

## If Something Looks Wrong
- App says Supabase is not configured
  Check the Vercel env vars and redeploy.
- Login works in Supabase but not in the app
  Check that the allowed email in the SQL schema matches the manually created user.
  If you use `supabase/schema.local.sql`, rerun the latest version of that file in Supabase SQL Editor.
  Otherwise rerun `supabase/schema.sql`.
  That recreates `public.is_allowed_user()` with the current `auth.users`-based check and restores the execute grant for `authenticated`.
- Login page says Turnstile is not configured
  Add `VITE_TURNSTILE_SITE_KEY` to `.env.local` for local use and to Vercel Project Settings -> Environment Variables for production.
  Then redeploy Vercel.
  In Supabase Dashboard -> Authentication, confirm CAPTCHA is enabled with Cloudflare Turnstile and the current Turnstile secret is saved there.
- Someone keeps trying passwords against the login screen
  Double-check that public signups are still disabled in Supabase.
  Confirm Supabase CAPTCHA is still enabled with Cloudflare Turnstile.
  Review the current Supabase Auth password rate-limit or bot-protection settings and keep them enabled.
  Change the account password to a long unique one if you suspect it has been exposed.
  The app now slows repeated failures from the same browser, but direct attacks still have to be stopped by Supabase.
- App stays on "Checking your session"
  Redeploy the latest code, then fully close and reopen the installed PWA or refresh the browser tab so the updated auth bootstrap is loaded.
- Installed mobile app is still showing the old UI after a deploy
  Fully close the installed PWA and reopen it once while online.
  If it still shows the old build, open the site in the mobile browser directly once so the new service worker can take control, then reopen the installed app.
- Cloud sync is missing old cards
  Open the old device or browser and sign in there.
  Check Settings -> Cloud Sync to compare this device counts vs cloud counts.
  The latest app now uses one `Sync Now` action that pulls cloud changes, pushes local changes, and automatically runs a deeper full-library reconcile if counts still differ.
  If counts still do not converge after a second `Sync Now`, refresh the app once and sync again.
- A deleted card comes back after syncing another device
  Update both devices to the latest build and run `Sync Now` on each.
  Also rerun the latest SQL in Supabase SQL Editor.
  The current sync logic treats deletions as tombstones, and the latest schema also protects newer tombstones server-side so a stale undeleted copy should no longer recreate the card.
- Delete says it worked, but the card is still visible on the same device
  Update to the latest build and try again from `Cards`.
  The current app now verifies that the local Dexie delete tombstone was actually written before reporting success.
- Deck organization looks different across devices
  Rerun the latest `supabase/schema.local.sql` or `supabase/schema.sql` in Supabase SQL Editor.
  The current app can still sync with the legacy deck shape, but the richer deck metadata only syncs completely after those columns exist in Supabase.
  Then press `Sync Now` on the fuller device first, followed by the other devices.
- Pleco import created fewer decks than expected
  This app currently supports one deck per card.
  The first Pleco category used for that card becomes the primary deck, while additional Pleco categories are saved as tags on that card.
  If multiple devices export overlapping Pleco cards, the app unions those cards safely instead of duplicating them across decks.
  If Pleco exported cards without category columns, the app groups them into a single `Pleco Import` deck.
- Pleco import created empty decks with long card text as the deck name
  Update to the latest build.
  The parser now reads Pleco's tab-separated `.txt` export directly and also ignores suspicious category values that look like full flashcard text instead of real Pleco deck names.
  To clean up old bad imports, open `Decks`, press `Select`, then `Select Empty`, and delete those empty decks in one batch.
- Settings shows more cards than Decks or Home after deleting bad Pleco decks
  Update to the latest build and run `Sync Now` on the affected device.
  The current sync layer now detaches active cards from deleted deck links and pushes that cleanup back to Supabase so cards stop hiding inside deleted decks.
  After that sync, any previously hidden cards should show up as standalone cards so you can review or bulk-delete them deliberately.
- One device still refuses to pull cards even though the cloud count is higher
  Update that device to the latest build and run `Sync Now` again.
  The current sync logic now lets an active cloud row heal a stale synced tombstone on that device, so a stale browser should no longer get stuck refusing valid remote cards forever.
- Repo changes are live in GitHub but not in production
  Make sure Vercel redeployed the latest commit and that env var changes were applied to a fresh deployment.
