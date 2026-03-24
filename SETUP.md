# 汉字学习 — Setup Guide

## Step 1: Install dependencies

Open a terminal in the `chinese-study-app` folder and run:

```bash
npm install
```

## Step 2: Run locally

```bash
npm run dev
```

This starts the dev server at `http://localhost:5173`. Open it in your browser.

## Step 3: Push to GitHub

1. Go to https://github.com/new
2. Name the repo: `chinese-study-app`
3. Leave it as Public (or Private — your choice)
4. Do NOT initialize with README, .gitignore, or license (we already have them)
5. Click "Create repository"
6. Back in your terminal, run these commands:

```bash
cd chinese-study-app
git remote add origin https://github.com/redeore99/chinese-study-app.git
git push -u origin main
```

## Step 4: Deploy to Vercel

1. Go to https://vercel.com and sign up with your GitHub account
2. Click "Add New Project"
3. Import `redeore99/chinese-study-app` from GitHub
4. Vercel auto-detects Vite — just click "Deploy"
5. Done! Your app will be live at `chinese-study-app.vercel.app` (or similar)

Every time you push to `main`, Vercel auto-deploys.

## Step 5: Install as PWA on your phone

1. Open the Vercel URL on your phone's browser
2. **iPhone**: Tap Share → "Add to Home Screen"
3. **Android**: Tap the 3-dot menu → "Install app" or "Add to Home Screen"

Now it works like a native app — even offline!
