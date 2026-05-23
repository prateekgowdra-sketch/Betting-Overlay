# Betting Overlay

Betting Overlay is a Chrome extension MVP that turns live game data and Kalshi-style market positions into a lightweight on-screen companion for sports viewers.

## Overview

Watching a game while tracking prediction market positions is fragmented: the stream is in one place, market contracts are in another, and player stat context is often buried across multiple tabs. Betting Overlay solves that by placing a compact live overlay directly on top of any webpage, combining game state, tracked player legs, and Kalshi-style position context into a single view.

This repository is structured as a serious MVP rather than a throwaway prototype. The Chrome extension UI is intentionally thin, the backend owns all live data retrieval and future API key management, and shared types keep the system ready for deeper integrations.

## Current MVP Features

- Floating Chrome extension overlay that injects onto normal webpages
- Draggable, minimizable, and closable sports-broadcast style UI
- Live game scoreboard for the Knicks vs Cavaliers demo matchup
- Kalshi-style position cards with:
  - market title
  - side
  - contracts
  - entry price
  - current price
  - unrealized P/L
  - what still needs to happen
- Player stat tracker cards for demo market legs
- Auto-updating demo mode that simulates a live backend feed
- Manual parlay entry mode with persistent locally saved legs
- Toggle between demo feed mode and manual parlay mode from the popup
- Two overlay layouts:
  - top ticker mode
  - detailed card mode
- Polling architecture between the extension and local backend every 15 seconds
- Loading and error states in the overlay
- Backend service split for future sports API and Kalshi API replacement

## Architecture

The current MVP follows a clean three-layer structure:

1. Chrome Extension UI
   - Displays the overlay
   - Polls backend endpoints
   - Contains no API keys
   - Handles loading and error presentation

2. Backend API
   - Serves live game state and Kalshi-style positions
   - Uses mock services today
   - Is designed to later connect to real NBA and Kalshi APIs

3. Shared Types
   - Defines the core overlay domain model:
     - `GameState`
     - `PlayerStat`
     - `KalshiPosition`
     - `OverlayStatus`
     - `MarketLeg`

## Tech Stack

- Chrome Extension Manifest V3
- React
- TypeScript
- Vite
- Node.js
- Lightweight custom local backend server

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create a backend environment file:

```bash
cp backend/.env.example backend/.env
```

3. Start the local backend:

```bash
npm run backend
```

4. Build the Chrome extension in a second terminal:

```bash
npm run build
```

## Load the Chrome Extension

1. Open `chrome://extensions`
2. Turn on **Developer Mode**
3. Click **Load unpacked**
4. Select the `dist` folder

Once loaded, open any standard webpage, click the extension icon, and keep the backend running on `http://localhost:3001`.

## Demo Mode

The current MVP ships with an auto-updating demo mode designed to simulate the final live product flow.

- The extension polls the backend every 15 seconds
- The backend advances mock Knicks vs Cavaliers game state over time
- Scores, quarter, game clock, and tracked player stats change between polls
- Kalshi-style position values update based on the latest mock game context

This gives the project a realistic interaction model without embedding real provider credentials or depending on unstable third-party APIs during MVP development.

## Manual Parlay Mode

The extension also supports a fully local manual parlay workflow for demos and UI testing.

- Add a parlay name, wager, payout, and odds from the popup
- Track American odds movement at the parlay level and per-leg level
- Add multiple manual legs:
  - player props
  - team moneylines
  - spreads
  - game totals
  - Kalshi-style manual prediction market legs
- When possible, manual legs are matched against the existing mock Knicks vs Cavaliers live game feed for live progress
- Switch the popup's **Overlay mode** from `Demo mode` to `Manual parlay mode`
- The overlay will render your saved parlay instead of the Knicks vs Cavaliers demo feed
- The ticker and card views will show:
  - wager and payout summary
  - original odds vs current odds
  - implied probability movement
  - whether payout improved or worsened for the bettor
  - live leg progress for matched player props, moneylines, spreads, and totals

Manual parlay entries are stored in `chrome.storage.local`, so they persist across page refreshes and extension reloads.

## Planned Future Features

- Real Kalshi API integration
- Real NBA live stats API integration
- Automatic market-to-player matching
- Stream overlay improvements
- Player highlighting

## Notes

- The content script is configured for normal supported webpages via Chrome extension injection
- Chrome will not run the overlay on protected pages such as `chrome://` URLs or the Chrome Web Store
- Future sports data API keys should live only in the backend `.env`, never in the extension bundle

## Disclaimer

This project is a software demo and portfolio project. It is not official betting advice, does not guarantee market accuracy, and is not affiliated with, endorsed by, or sponsored by Kalshi.
