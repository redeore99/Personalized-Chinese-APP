# Mission Control — 汉字学习 (Chinese Study App)

## What This Is
A personal Chinese character study PWA (Progressive Web App) for a single user (Pablo). The app uses spaced repetition (SM-2 algorithm) and stroke-order writing practice (HanziWriter) to help learn Chinese characters. All data is stored locally in the browser via IndexedDB (Dexie.js).

## Tech Stack
- **Frontend**: React 18 + Vite 6
- **Routing**: React Router v6 (HashRouter)
- **Database**: Dexie.js (IndexedDB wrapper) — all data is local, no backend
- **Writing**: HanziWriter for stroke-by-stroke practice
- **PWA**: vite-plugin-pwa (offline-capable, installable)
- **Styling**: Custom CSS, dark theme, mobile-first
- **Auth**: Client-side PIN lock (SHA-256 hashed, stored in localStorage)

## Project Structure
```
src/
  main.jsx              — React entry point
  App.jsx               — Router, nav bar, PinLock wrapper
  index.css             — All styles (dark theme)
  components/
    PinLock.jsx          — PIN lock screen (setup + unlock)
  pages/
    HomePage.jsx         — Dashboard with stats (due, reviewed, known, total)
    ReviewPage.jsx       — Flashcard review with SRS ratings (Again/Hard/Good/Easy)
    WritePage.jsx        — Stroke-order writing practice with HanziWriter
    AddCardPage.jsx      — Add new characters with pinyin, meaning, examples, tags
  lib/
    db.js               — Dexie database schema, CRUD operations, stats queries
    srs.js              — SM-2 algorithm (calculateNextReview, previewIntervals)
```

## Key Design Decisions
- **Single-user app**: Protected by a PIN lock. No multi-user accounts or backend auth.
- **Offline-first**: Works without internet once installed as PWA.
- **SRS integrity**: The PIN lock exists specifically to prevent others from using the app and corrupting the spaced repetition schedule.
- **Local data only**: No cloud sync. All cards, review history, and writing logs live in IndexedDB.

## Current Status (v0.1)

### Working
- Card creation (character, pinyin, meaning, examples, tags, notes)
- Flashcard review with SM-2 SRS scheduling
- Writing practice with HanziWriter (stroke quiz, hints, animation)
- Home dashboard with stats (due count, reviewed today, known words, total)
- PWA installable with offline support
- PIN lock screen for single-user protection
- Dark theme, mobile-first responsive design

### Not Yet Built / TODO
- Dictionary lookup / auto-fill (CC-CEDICT integration) when adding cards
- Deck management (create, organize cards into decks)
- Card editing and deletion UI
- Search/browse all cards
- Detailed stats page (review history graphs, accuracy trends, streak tracking)
- Data export/import (JSON backup)
- Settings page (reset PIN, adjust SRS parameters, daily review limits)
- Audio pronunciation playback
- Multi-character writing practice (currently only first char is practiced)
- Tag-based filtering for reviews
- Undo last review rating

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build
```

## Deployment
Static site on Vercel. Pushes to `main` auto-deploy.
Repo: github.com/redeore99/chinese-study-app
