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
- **Backup**: AES-256-GCM encrypted export/import (PBKDF2 key derivation from PIN)

## Project Structure
```
src/
  main.jsx              — React entry point
  App.jsx               — Router, nav bar (5 tabs), PinLock wrapper
  index.css             — All styles (dark theme)
  components/
    PinLock.jsx          — PIN lock screen (setup, unlock, lockout, security alerts)
  pages/
    HomePage.jsx         — Dashboard with stats (due, reviewed, known, total)
    ReviewPage.jsx       — Flashcard review with SRS ratings (Again/Hard/Good/Easy)
    WritePage.jsx        — Stroke-order writing practice with HanziWriter
    AddCardPage.jsx      — Add new characters with pinyin, meaning, examples, tags
    SettingsPage.jsx     — Backup/restore, security log viewer
  lib/
    db.js               — Dexie database schema, CRUD operations, stats queries
    srs.js              — SM-2 algorithm (calculateNextReview, previewIntervals)
    backup.js           — AES-256-GCM encrypted export/import
```

## Security Policy

### Threat Model
This is a personal study app. The primary threats are:
1. **Casual unauthorized use** — Someone opens the app and reviews cards, corrupting the SRS schedule.
2. **Data loss** — Browser data gets cleared, device breaks, or someone maliciously wipes localStorage/IndexedDB.
3. **Data snooping** — Someone inspects browser storage to see what you're studying (low sensitivity, but still private).

### Defenses in Place

#### PIN Lock (src/components/PinLock.jsx)
- PIN is **SHA-256 hashed with a salt** before storage — never stored in plaintext.
- PIN is required on every new session (uses sessionStorage, clears when browser closes).
- **Failed attempt logging**: Every wrong PIN is logged with timestamp, user agent, and event type (`wrong_pin` or `tamper_detected`) to localStorage.
- **Escalating lockout**: After 5 failed attempts, the app locks for 5 minutes. Continued failures escalate to 15m, 30m, then 60m lockouts.
- **Security alert**: On successful login, if there were failed attempts since the last login, a prominent warning screen is shown with timestamps before the user can proceed. Tamper events are highlighted with a TAMPER label. User must acknowledge the alert.

#### Tamper Detection (src/components/PinLock.jsx + src/lib/db.js)
- The PIN hash is stored redundantly in **both localStorage and IndexedDB** (`security` table).
- On every app load, both stores are cross-checked.
- If localStorage has been cleared but IndexedDB retains the hash, the PIN is **automatically restored** from IndexedDB, a `tamper_detected` event is logged, and a **Tampering Detected** alert is shown to the user.
- This prevents the bypass attack where an attacker clears localStorage to trigger "first-time setup" and create their own PIN.
- The tamper flag persists across sessions until the legitimate user authenticates and acknowledges it.

#### Encrypted Backup (src/lib/backup.js)
- Exports ALL data (cards, decks, review logs, writing logs, **and security metadata**) as a single encrypted file.
- **Security metadata in backups**: PIN hash, failed attempt log, last login timestamp, and IndexedDB security entries are all included in the encrypted payload. A full restore recovers the complete security state.
- Encryption: **AES-256-GCM** with key derived from PIN via **PBKDF2** (100,000 iterations, SHA-256).
- Each backup has a unique random salt (16 bytes) and IV (12 bytes).
- The backup file contains **zero plaintext data** — only `{ salt, iv, ciphertext }` in base64.
- Import requires the same PIN to decrypt. Wrong PIN = decryption fails gracefully.
- Restore is atomic (Dexie transaction) — either everything restores or nothing does.
- On restore, security metadata is written back to both localStorage and IndexedDB, fully restoring the security perimeter.

#### What's NOT Sensitive
- No passwords, tokens, or API keys are stored anywhere.
- No personal information beyond Chinese study cards.
- The PIN hash in localStorage is not useful to an attacker (salted SHA-256).
- The failed attempts log contains only timestamps, user agents, and event types — no PINs or guesses.

### Security Guidelines for Development
When working on this app, always:
- **Never store the PIN in plaintext** — always hash or use as key derivation input.
- **Never add cloud sync or backend calls** without revisiting the security model.
- **Never log or expose card data** in unencrypted form outside the app.
- **Keep backups encrypted** — the user's PIN is the only key.
- **Maintain the lockout system** — do not bypass or weaken it.
- **Test the security alert flow** — failed attempts must always surface to the user on next login.
- **Keep the dual-store PIN hash in sync** — any code that writes the PIN hash to localStorage must also write it to IndexedDB via `setSecurityValue('pinHash', hash)`.
- **Never remove the tamper detection** — the IndexedDB cross-check is the last line of defense against localStorage clearing attacks.

## Key Design Decisions
- **Single-user app**: Protected by a PIN lock. No multi-user accounts or backend auth.
- **Offline-first**: Works without internet once installed as PWA.
- **SRS integrity**: The PIN lock exists specifically to prevent others from using the app and corrupting the spaced repetition schedule.
- **Local data only**: No cloud sync. All cards, review history, and writing logs live in IndexedDB.
- **Defense in depth**: PIN lock (prevention) + attempt logging (detection) + tamper detection (integrity) + encrypted backup (recovery).

## Current Status (v0.1)

### Working
- Card creation (character, pinyin, meaning, examples, tags, notes)
- Flashcard review with SM-2 SRS scheduling
- Writing practice with HanziWriter (stroke quiz, hints, animation)
- Home dashboard with stats (due count, reviewed today, known words, total)
- PWA installable with offline support
- PIN lock screen with escalating lockout, security alerts, and tamper detection
- Encrypted backup/restore (AES-256-GCM) with security metadata
- Settings page with security log viewer
- Dark theme, mobile-first responsive design (5-tab navigation)

### Not Yet Built / TODO
- Dictionary lookup / auto-fill (CC-CEDICT integration) when adding cards
- Deck management (create, organize cards into decks)
- Card editing and deletion UI
- Search/browse all cards
- Detailed stats page (review history graphs, accuracy trends, streak tracking)
- Settings: reset/change PIN
- Settings: adjust SRS parameters, daily review limits
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
