# vrcmaps

VRChat world browser — reads local VRCX favorites, fetches live data and covers from VRChat public API.

## Quick Start

```bash
pip install pyinstaller
pyinstaller --onefile --name vrcmaps --add-data "covers;covers" --console vrcmaps.py
```

Or run directly:

```bash
python vrcmaps.py
```

Browser opens automatically at http://127.0.0.1:3456

On first launch the app reads VRCX database, fetches VRChat API data, and downloads cover images. This takes a few seconds. Refresh the page once data is loaded.

## How it works

1. Reads local VRCX.sqlite3 — `favorite_world` and `cache_world` tables
2. Calls VRChat public API for each world (no login required)
3. Downloads cover images from VRChat CDN, caches in `covers/` directory
4. Generates a static HTML page grouped by favorite categories
5. Starts a local HTTP server on port 3456

## Dependencies

- Python 3.9+ (stdlib only — `sqlite3`, `http.server`, `urllib`)
- VRCX client installed locally
- VRChat public API (api.vrchat.cloud)

## See also

- [VRCX](https://github.com/vrcx-team/VRCX)
- [VRChat API docs](https://vrchat.community/reference/get-world)
