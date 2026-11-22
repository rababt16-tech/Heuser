# Homework 9: Rabab's Server

One Python (Flask) server on Render with four pages:

| Address | Page | Folder |
|---|---|---|
| `/` | Home page with three buttons | `home/` |
| `/game` | Homework 6 game: Pattern Memory (a copy) | `game/` |
| `/portfolio` | Homework 8 portfolio (a copy) | `portfolio/` |
| `/api` | **The Assembly**: live World Bank + Wikipedia data | `api/` |

## Before you upload
1. **game/**: already contains the Homework 6 game (Pattern Memory). If the files in your `CS_CRP/Homework_6` folder are newer, copy those over these.
2. **portfolio/**: replace the three files with an **exact copy** of everything in your `CS_CRP/Homework_8` folder, including `me.jpg` and the Homework 7 link.
3. Don't move, rename or change the `Homework_6` or `Homework_8` folders themselves.

## Folder layout
```
CS_CRP/Homework_9/
  app.py              the server
  requirements.txt    libraries Render installs
  .gitignore          keeps secrets and junk out of GitHub
  home/               index.html (home), 404.html (error page), home.css
  game/               copy of Homework 6
  portfolio/          copy of Homework 8
  api/                index.html, assembly.css, assembly.js
```

## What each file does
- **app.py**: the backend. It connects each address (route) to a response:
  - `/` sends `home/index.html`.
  - `/game`, `/portfolio` and `/api` redirect to the same address with a `/` at the end (e.g. `/game/`). That way each page's own CSS, JS and image files are found.
  - Game and portfolio pages get a small "← Home" button added when they are sent. The original files are not changed.
  - `/data/delegates` asks the World Bank API for every country and its population. It drops groups like "Arab World" and sends the list to the page as JSON.
  - `/data/briefing/<code>` asks Wikipedia for a short summary of one country.
  - **Cache:** API answers are remembered for 30 minutes (`CACHE_SECONDS`), so the APIs aren't asked again for every visitor. If an API is down, an older answer is used when there is one.
  - Any unknown address gets the themed `404.html` instead of a crash.
  - The bottom of the file reads the `PORT` environment variable and listens on `0.0.0.0` (all addresses), which Render needs.
- **requirements.txt**: Flask (the web framework), gunicorn (the production server Render runs) and requests (lets Python call other websites' APIs).
- **.gitignore**: stops `.env` (secret) files, virtual environments and cache folders from being uploaded.
- **home/**: the three-button home page, the "snack not found" 404 page and their shared CSS.
- **api/index.html**: the Assembly page layout, including the required concept text and the loading and error messages.
- **api/assembly.js**:
  - Fetches `/data/delegates` and shows "Delegates are taking their seats…" while waiting. If the request fails or takes longer than 25 seconds, it shows "Session adjourned" with a Try again button.
  - Draws one seat per country in a half-circle, grouped by region.
  - Handles clicks, the search box, the region filter chips, the "Draw my country" animation, the placard, the briefing and the Speakers' list.
- **api/assembly.css**: all the styling and animations for the Assembly page.

## Run it on your own computer
```
pip install -r requirements.txt
python app.py
```
Then open http://localhost:5000

## Render settings
| Setting | Value |
|---|---|
| Language | Python 3 |
| Branch | main |
| Root Directory | `CS_CRP/Homework_9` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app --bind 0.0.0.0:$PORT` |
| Instance Type | Free |
| Environment variables | none needed (both APIs are free and need no key) |

## For the submission form
- **Framework:** Flask (Python)
- **APIs:**
  - World Bank Open Data API (countries + population)
  - Wikipedia REST API (country summaries)
  - Flags come from flagcdn.com.
- **Not weather:** ✓
- **No API key:** ✓ (nothing secret in the repo)
- **Bonus features:**
  - Server-side cache.
  - Search box and region filter.
  - Themed 404 page.
  - A second API (Wikipedia) combined with the first.
