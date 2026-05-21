# Kalshi Live Overlay

Demo Chrome extension MVP for tracking mock Kalshi-style sports positions while watching a live game on any webpage.

## What It Does

- Injects a floating overlay onto webpages
- Shows live mock game state for Knicks vs Cavaliers
- Tracks Kalshi-style open positions
- Displays player prop progress with status colors and progress bars
- Polls a `LiveStatsService` every 15 seconds and updates the overlay automatically
- Includes an auto-updating demo mode that advances mock score, clock, quarter, and player stats on each backend poll
- Keeps the popup focused on game selection and demo mode settings

## Setup

1. `npm install`
2. Copy `backend/.env.example` to `backend/.env`
3. Run `npm run backend`
4. In a second terminal, run `npm run build`
5. Go to `chrome://extensions`
6. Turn on **Developer Mode**
7. Click **Load unpacked**
8. Select the `dist` folder

## How To Use

- Open any normal webpage
- Click the Kalshi Live Overlay extension icon
- Choose the game feed and toggle demo mode in the popup
- Keep the backend running on `http://localhost:3001`
- Watch the overlay refresh live on the page every 15 seconds

## Notes

- This project uses Chrome Manifest V3
- The content script is configured for `<all_urls>`
- Chrome does not allow content scripts on certain restricted pages such as `chrome://` URLs or the Chrome Web Store
- The build output used for Chrome is the `dist` folder
- Live game data is fetched from backend routes on `http://localhost:3001/api/live/...`
- Any future sports data API key should live only in `backend/.env`, never in the Chrome extension bundle

## Validation

- `manifest.json` is included in the build as a Manifest V3 file
- The overlay content script loads on all supported URLs
- The backend exposes `GET /api/live/game/:gameId` and `GET /api/live/players/:gameId`
- `npm run build` completes successfully with no TypeScript errors
