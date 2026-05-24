# Betting Overlay

Betting Overlay is a Chrome extension MVP that overlays live game context, prediction-market style positions, and manual parlay tracking directly on top of a webpage.

## Problem

Watching a game while tracking sports positions is fragmented. The stream is in one tab, stats are in another, and market context is often buried across dashboards. Betting Overlay brings those signals into a single lightweight viewing layer so a user can follow the game and their positions at the same time.

## Core Features

- Chrome Manifest V3 extension that injects an overlay onto normal webpages
- Two overlay modes:
  - compact top ticker
  - detailed card view
- Auto-updating demo game for Knicks vs Cavaliers
- Kalshi-style position cards with progress and P/L context
- Player prop tracking cards and ticker chips
- Manual parlay entry with multiple leg types
- Odds movement tracking for parlays and legs
- Persistent overlay state with `chrome.storage.local`
- Local backend that owns all API access and future secret management

## Demo Mode

The default experience is a mock/demo mode designed to simulate the final product flow without requiring live third-party APIs.

- The extension polls the backend every 15 seconds
- The backend exposes multiple selectable mock games through `GET /api/live/games/today`
- The current demo includes:
  - Knicks vs Cavaliers
  - Thunder vs Spurs
- Score, quarter, clock, and selected player stats update automatically
- Mock Kalshi-style market values update with the game state

## Manual Parlay Tracking

Manual mode lets a user enter and persist their own parlay without connecting a sportsbook or broker account.

Supported leg types:
- player prop
- team moneyline
- spread
- game total
- prediction-market / Kalshi-style leg

For prediction-market style legs, the user can optionally add a Kalshi market ticker so the backend can look up read-only market pricing when configured.

The popup also stores a `selectedGameId`, so both demo mode and manual parlay mode can follow the currently chosen game instead of a single hardcoded matchup.

## Odds Movement Tracking

The overlay tracks odds movement for manually entered parlays and legs.

- American odds formatting
- implied probability conversion
- chance direction
- payout better/worse direction
- original odds to current odds comparison

## Mock Live Sports Data

Today’s MVP still relies on mock player stats and a simulated game timeline as the primary demo source. This keeps the repo stable for demos and portfolio presentation while preserving the final architecture:

`Chrome Extension -> Local Backend -> Sports Data Provider -> Kalshi Provider`

## Future Sports API Integration

The backend already supports a provider-based sports data layer.

- default: `mock`
- optional live scores provider: `the_odds_api`
- placeholder provider path for future integration: `sportsdataio`

At the moment:
- `mock` powers the full demo experience
- `the_odds_api` is wired for normalized game-level score data
- `sportsdataio` is scaffolded as a future provider path and currently falls back safely to mock

Player-level stats are still mock-backed unless a future player-stats provider is added.

To run with The Odds API:

```bash
SPORTS_DATA_PROVIDER=the_odds_api
THE_ODDS_SPORT_KEY=basketball_nba
THE_ODDS_API_KEY=your_key_here
```

What this currently enables:
- real NBA games in `GET /api/live/games/today`
- normalized game state from the backend for a selected real game
- safe player-stats fallback with an unavailable reason when the provider does not supply box score data

## Future Read-Only Kalshi Integration

The backend now includes a read-only Kalshi client layer with:

- balance lookup
- positions lookup
- market lookup
- market list support in the client

Important:
- mock Kalshi mode is still the default
- no trading is implemented
- no order placement exists
- no buy/sell actions are exposed

## Tech Stack

- Chrome Extension Manifest V3
- React
- TypeScript
- Vite
- Node.js
- Local JSON-backed backend services

## Architecture

Text diagram:

```text
Chrome Extension UI
  -> Local Backend API
    -> Mock Sports Provider or Future Live Sports Provider
    -> Mock Kalshi Provider or Future Read-Only Kalshi Provider
```

Responsibilities:

1. Chrome Extension UI
   - renders the overlay
   - polls backend endpoints
   - stores lightweight UI state
   - contains no API secrets

2. Backend API
   - serves live game state
   - serves Kalshi-style positions and market data
   - handles provider selection
   - owns API credential handling

3. Shared Types
   - defines common data contracts used across the UI and backend mappings

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

## Backend Setup

Create a backend env file:

```bash
cp backend/.env.example backend/.env
```

Start the backend:

```bash
npm run backend
```

Default safe configuration:

```bash
SPORTS_DATA_PROVIDER=mock
THE_ODDS_SPORT_KEY=basketball_nba
THE_ODDS_API_KEY=
SPORTSDATAIO_API_KEY=
KALSHI_MODE=mock
KALSHI_ENV=demo
KALSHI_API_KEY_ID=
KALSHI_PRIVATE_KEY_PATH=
```

Available mock games route:

```bash
curl http://localhost:3001/api/live/games/today
```

## Load the Chrome Extension

1. Open `chrome://extensions`
2. Turn on `Developer Mode`
3. Click `Load unpacked`
4. Select the `dist` folder

Then open a normal webpage such as `https://example.com` and keep the backend running on `http://localhost:3001`.

## Security and Safety

- API keys stay backend-only
- private keys stay backend-only
- the Chrome extension does not receive Kalshi credentials
- mock mode remains the default for both sports data and Kalshi data
- this project is read-only with respect to external accounts

## Disclaimer

This project is a software demo and portfolio project.

- It is not financial advice.
- It is not betting advice.
- It does not place trades.
- It does not submit sportsbook bets.
- It is not affiliated with, endorsed by, or sponsored by Kalshi.

## Roadmap

- Add a real player-stats provider to replace mock player tracking
- Improve market-to-player matching and normalization
- Support multiple saved manual parlays
- Add richer read-only Kalshi market syncing in the overlay
- Improve stream-aware overlay positioning and responsiveness
- Add clearer empty/error/reset states for demo workflows
