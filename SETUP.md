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

## First-Time Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/schema.local.sql` if you want to keep the real allowed email out of the public repo.
4. If you do not use the local-only file, replace the placeholder email in `supabase/schema.sql` and run that instead.
5. In Supabase Authentication, keep email/password enabled.
6. Disable public signups.
7. Manually create the one allowed user account.
8. In Supabase Settings -> API Keys, copy the `Publishable key`.
9. Build the project URL as `https://<project-ref>.supabase.co` or copy it from Supabase project settings.
10. In Vercel Project Settings -> Environment Variables, add:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

11. Save the Vercel env vars and redeploy.
12. Open the deployed app and sign in with the manually created account.
13. On each older browser that already has local study data, sign in there too and use `Upload Local Data to Cloud` once.

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
- Never use the Supabase secret key or service role key in this frontend app.
- The browser stores a session token after login, not the user's password.
- Encrypted backups use a separate backup password and do not replace account security.

## If Something Looks Wrong
- App says Supabase is not configured
  Check the Vercel env vars and redeploy.
- Login works in Supabase but not in the app
  Check that the allowed email in the SQL schema matches the manually created user.
  If you use `supabase/schema.local.sql`, rerun the latest version of that file in Supabase SQL Editor.
  Otherwise rerun `supabase/schema.sql`.
  That recreates `public.is_allowed_user()` with the current `auth.users`-based check and restores the execute grant for `authenticated`.
- App stays on "Checking your session"
  Redeploy the latest code, then fully close and reopen the installed PWA or refresh the browser tab so the updated auth bootstrap is loaded.
- Cloud sync is missing old cards
  Open the old device or browser and sign in there.
  Check Settings -> Cloud Sync to compare this device counts vs cloud counts.
  The latest app will auto-upload a fuller local library once if this device has more cards than the cloud.
  If the counts still differ after `Sync Now`, run `Upload Local Data to Cloud`.
- Repo changes are live in GitHub but not in production
  Make sure Vercel redeployed the latest commit and that env var changes were applied to a fresh deployment.
