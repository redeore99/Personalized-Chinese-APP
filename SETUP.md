# Chinese Study App - Beginner Setup Guide

This guide assumes:

- You are using Windows
- You want to use the app on your computer and on your phone

## What You Are Setting Up

You need 4 things:

1. `Node.js`
   This gives you `npm`, the tool used to install and run the app locally.
2. `GitHub`
   This stores the code online.
3. `Supabase`
   This stores your account and synced study data.
4. `Vercel`
   This publishes the app to the web so you can open it on your phone.

## Step 1: Install Node.js

1. Go to the Node.js download page.
2. Download the current LTS installer for Windows.
3. Run the installer and keep the default options.
4. After installation, open a new terminal and run:

```powershell
node -v
npm -v
```

If both commands show a version number, Node.js and npm are installed correctly.

## Step 2: Create a Supabase Project

1. Go to the Supabase dashboard.
2. Sign up or log in.
3. Click `New project`.
4. Choose an organization.
5. Give the project a name, for example `chinese-study-app`.
6. Create a strong database password and save it somewhere safe.
7. Wait for the project to finish creating.

## Step 3: Configure Supabase Database and Single User Access

1. In Supabase, open your project.
2. Open `SQL Editor`.
3. Open the file `supabase/schema.sql` from this repo.
4. Copy everything from that file and paste it into the SQL Editor.
5. Click `Run`.

Before you run it, replace the placeholder email in that file with your real email address.

If you want to keep your email out of the public repo, use `SETUP.local.md` and
`supabase/schema.local.sql` instead of editing the tracked files.

## Step 4: Create Your One User Account in Supabase

1. In Supabase, go to `Authentication`.
2. Open the settings for sign-in providers.
3. Make sure email/password sign-in is enabled.
4. Disable public sign-ups.
5. Go to `Authentication` -> `Users`.
6. Click `Add user`.
7. Create your own user with your real email address.

8. Choose a strong password and save it in a password manager.
9. If Supabase asks whether the email should be confirmed, confirm it or mark it confirmed during creation.

After this, only your account should exist for this app.

## Step 5: Find Your Supabase Project URL and Client Key

1. In Supabase, open your project.
2. Open the `Connect` dialog or project API settings.
3. Copy:

- Project URL
- Publishable key

Do not use the `service_role` key in this app.

## Step 6: Create the Local Environment File

In the project folder, create a file named:

`.env.local`

You can copy `.env.example` and then edit it.

It should look like this:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Replace the first two values with the real values from Supabase.

## Step 7: Install the App Dependencies

Open a terminal in this project folder and run:

```powershell
npm install
```

This downloads the libraries the app needs.

## Step 8: Run the App Locally

In the same terminal, run:

```powershell
npm run dev
```

You should see a local address, usually:

`http://localhost:5173`

Open that address in your browser.

## Step 9: Sign In for the First Time

1. Open the app in the browser.
2. Sign in with the email and password you created in Supabase.

If this browser already contains your older local study data, open `Settings` and click:

`Upload Local Data to Cloud`

Do this once per old device/browser that already has your study data saved locally.

## Step 10: Push the Code to GitHub

If the repo is not already on GitHub:

1. Create a GitHub repository.
2. In the project folder, run:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

If the repo is already connected to GitHub, just push your latest changes:

```powershell
git push
```

## Step 11: Deploy the App to Vercel

1. Go to Vercel.
2. Sign in with GitHub.
3. Click `Add New Project`.
4. Import this GitHub repository.
5. Vercel should detect that it is a Vite app automatically.
6. Before deploying, add these environment variables in the Vercel project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the same values as your local `.env.local`.

7. Click `Deploy`.

After deployment, Vercel will give you a public URL.

## Step 12: Use the App on Your Phone

1. Open the Vercel URL on your phone browser.
2. Sign in with the same email and password.

If you want the app icon on your phone home screen:

- On iPhone: Share -> `Add to Home Screen`
- On Android: Browser menu -> `Install app` or `Add to Home Screen`

## Everyday Use

- Use the same email and password on every device.
- Your study data syncs through Supabase.
- Backups in `Settings` are still useful as an extra safety measure.

## Important Safety Notes

- Your password should not be stored in this repo or in `.env.local`.
- The browser stores a session after you sign in. That is normal.
- The Supabase `service_role` key must never be added to this frontend app.
- If you lose a device, sign in to Supabase and revoke sessions or reset your password.

## If Something Fails

### `npm` is not recognized

Node.js is not installed correctly. Reinstall Node.js and open a new terminal.

### Login screen says your email is not allowed

Check that:

- the placeholder email in `supabase/schema.sql` was replaced with your real email before you ran it
- your manually created Supabase user uses that same email

### Login works locally but not on Vercel

Usually this means the Vercel environment variables are missing or wrong. Add them in the Vercel dashboard and redeploy.

### The app opens but your old cards are missing

Go to the old browser/device where the cards were originally used, sign in there too, then open `Settings` and click `Upload Local Data to Cloud`.
