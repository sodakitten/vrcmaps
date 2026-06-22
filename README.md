# vrcmaps 🗺️

**VRChat World Browser** — explore, search, and discover VRChat worlds with covers, stats, and live instance tracking.

## Features

- 🔍 **Search & Browse** VRChat worlds by name, author, or ID
- 🖼 **Auto-fetching** world cover images and thumbnails from VRChat CDN
- 📊 **Live stats** — heat, favorites, visits, capacity, popularity
- 🟢 **Instance tracking** — see active public instances with player counts
- 💾 **SQLite database** for persistent world caching
- 🌐 **Web-based** — no install needed, just open your browser

## Architecture

`
vrcmaps/
├── server/
│   ├── index.js          # Express server (port 3456)
│   ├── db.js             # SQLite database layer
│   ├── vrchat.js         # VRChat API client + image downloader
│   ├── routes/api.js     # REST API routes
│   ├── package.json
│   └── public/           # Frontend SPA
│       ├── index.html
│       ├── style.css
│       ├── app.js
│       └── covers/       # Downloaded world covers
`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/worlds | List/search worlds from DB |
| GET | /api/worlds/:id | Get world detail with instances |
| POST | /api/worlds/lookup | Look up world on VRChat API by ID |
| POST | /api/worlds/search | Search worlds on VRChat API |
| POST | /api/worlds/:id/instances | Refresh instances for a world |
| POST | /api/covers/fetch | Download missing cover images |
| GET | /api/stats | Database statistics |

## Getting Started

`ash
cd server
npm install
npm start
`

Then open http://localhost:3456

**First use:** Search for a world or paste a VRChat world ID and click "Lookup ID" — it will fetch the world data from VRChat API, store it locally, and download the cover image.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)
- **Frontend:** Vanilla JS + CSS (zero dependencies)
- **API:** VRChat unofficial public API (api.vrchat.cloud)
