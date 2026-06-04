# Kalshi Live Overlay

Kalshi Live Overlay is a Chrome extension plus local backend for tracking Kalshi sports markets while you watch games or browse the web. It is built around read-only market tracking: search Kalshi markets, add watched markets, build combo slips, enter your side and entry price, and see live YES/NO probability movement in a compact overlay.

The project does not trade, place orders, or expose buy/sell controls.

## Current Product

The app is now a Kalshi-first market tracker instead of a generic sports-stat demo.

Core flows:

- Search public Kalshi sports markets across supported sports
- Add markets to a watchlist
- Pick your side: `YES` or `NO`
- Enter entry probability, contracts, amount risked, and notes
- Track current probability, movement, estimated value, and approximate P/L
- Build combo slips with one shared amount risked
- Show combo estimated probability, payout, and profit
- Display active markets in ticker or card overlay views
- Separate active, settled, and archived tracking items
- Match read-only Kalshi account positions when credentials are configured
- Keep finalized/settled markets out of the live ticker by default

## Overlay Views

Ticker mode is intentionally compact:

```text
Rangers win | YES 72% | You YES | +8% favorable
Spurs + Castle | Est. 31% | Pays ~$161.29 | Closing soon
```

Card mode shows the fuller tracking view:

- market title
- live/finalized status
- YES and NO probability
- your side
- entry probability
- current/final probability
- movement
- amount risked
- estimated value
- approximate P/L
- last updated time
- optional details section for tickers, raw bid/ask, contracts, position match, and market data status

## Combo Slip Tracking

The popup includes a combo builder that behaves like a lightweight betting slip:

1. Search a market leg
2. Add `YES` or `NO`
3. Set one combo amount risked
4. Review estimated chance, payout, and profit
5. Save the combo

Combo estimates are probability-based:

```text
estimatedComboProbability = leg1Probability * leg2Probability * ...
estimatedPayout = amountRisked / estimatedComboProbability
estimatedProfit = estimatedPayout - amountRisked
```

Settled combo behavior:

- finalized won leg counts as `100%`
- finalized lost leg makes the combo `lost`
- unavailable leg makes the combo `incomplete data`

Combo payout estimates are informational only. Markets may be correlated.

## Search

The backend includes Kalshi sports-market search helpers for common team, player, and stat queries.

Examples:

- `knicks`
- `knicks spurs`
- `spurs win`
- `stephon castle assists`
- `castle 6 assists`
- `rangers cardinals`
- `yankees`

Search supports query expansion and relevance scoring for aliases, matchup teams, open markets, volume, and close time. Generic terms like `yes`, `no`, `over`, `under`, `game`, and `win` are not enough by themselves to create random matches.

Comma-separated combo searches are split into separate result groups:

```text
spurs win, stephon castle assists
```

The popup groups results as:

- Best matches
- Related markets
- Weak matches hidden by default

## Settled Markets

Finalized binary markets are handled separately from active markets.

Rules:

- An active/open market shows tradable YES/NO probabilities.
- A settled YES result shows `YES 100%` and `NO 0%`.
- A settled NO result shows `YES 0%` and `NO 100%`.
- If the result is unknown, the UI shows `Finalized - result unknown`.
- The live ticker hides settled and archived items by default.
- Card view can show settled/finalized markets in a separate section.

This avoids the invalid `YES 100% / NO 100%` state.

## Read-Only Kalshi Account Data

The backend has read-only Kalshi account support for:

- auth health
- balance
- positions
- public market data
- unified overlay state

Useful routes:

```text
GET /api/kalshi/auth/health
GET /api/kalshi/balance
GET /api/kalshi/positions
GET /api/overlay/state
```

Positions are matched to watched markets by ticker. The app still works without real account credentials because manual tracking data is stored locally.

## Safety

This repo is read-only with respect to Kalshi and external accounts.

Not implemented:

- order placement
- trading
- buy buttons
- sell buttons
- sportsbook bet submission

Secrets must stay backend-only.

## Tech Stack

- Chrome Extension Manifest V3
- React
- TypeScript
- Vite
- Node.js backend
- Node test runner
- `chrome.storage.local` for extension-side state

## Architecture

```text
Chrome extension popup
  -> watchlist, combo builder, settings

Content overlay
  -> ticker/card UI
  -> polls unified overlay state

Local backend
  -> Kalshi public market data
  -> optional read-only Kalshi account data
  -> search normalization and market lifecycle handling
```

The extension never receives Kalshi private keys. Authenticated Kalshi reads are signed on the backend.

## Local Setup

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Start the backend:

```bash
npm run backend
```

The backend runs on:

```text
http://localhost:3001
```

Load the extension:

1. Open `chrome://extensions`
2. Turn on `Developer Mode`
3. Click `Load unpacked`
4. Select the `dist` folder
5. Keep the backend running locally

## Environment Variables

Create a local backend env file:

```bash
cp backend/.env.example backend/.env
```

Safe local defaults:

```bash
SPORTS_DATA_PROVIDER=kalshi
KALSHI_MODE=mock
KALSHI_ENV=demo
KALSHI_API_KEY_ID=
KALSHI_PRIVATE_KEY=
KALSHI_PRIVATE_KEY_PATH=
KALSHI_ENABLE_WEBSOCKET=false
BALLDONTLIE_API_KEY=
THE_ODDS_SPORT_KEY=basketball_nba
THE_ODDS_API_KEY=
SPORTSDATAIO_API_KEY=
```

Read-only Kalshi configuration:

```bash
SPORTS_DATA_PROVIDER=kalshi
KALSHI_MODE=real
KALSHI_ENV=demo
KALSHI_API_KEY_ID=your_key_id
KALSHI_PRIVATE_KEY=
KALSHI_PRIVATE_KEY_PATH=./secrets/kalshi.key
KALSHI_ENABLE_WEBSOCKET=false
```

For Vercel, prefer `KALSHI_PRIVATE_KEY` instead of `KALSHI_PRIVATE_KEY_PATH`. Paste the private key into the Vercel environment variable with newline characters preserved, or with `\n` escapes.

Keep real values only in `backend/.env`, Vercel environment variables, or a secure secret manager.

## Vercel Notes

This repository now includes Vercel API routes under `api/`, which wrap the existing backend handler. On Vercel, the frontend calls same-origin `/api` routes instead of `localhost:3001`.

Recommended Vercel project settings:

```text
Framework Preset: Vite
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Configure secrets in Vercel environment variables instead of committing them.

Do not commit:

- `backend/.env`
- `backend/secrets/`
- private key files
- `.env`
- `dist/`
- `node_modules/`
- `.DS_Store`

Current `.gitignore` covers these paths.

## Security Checklist

- API keys stay out of the extension bundle.
- Kalshi private keys stay in `backend/secrets/` or platform secrets.
- `backend/.env` is ignored.
- `backend/secrets/` is ignored.
- `dist/` and `node_modules/` are ignored.
- The backend logs whether credentials exist, not their values.
- The project uses read-only Kalshi account access only.

## Useful Commands

```bash
npm run build
npm test
npm run backend
git status --short --ignored
```

## Disclaimer

This is a software project for market-tracking UI experimentation.

- It is not financial advice.
- It is not betting advice.
- It does not place trades.
- It does not submit sportsbook bets.
- It is not affiliated with, endorsed by, or sponsored by Kalshi.
