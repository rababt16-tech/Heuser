"""
Rabab's Homework 9 server (Flask).

Routes
  /            home page with three buttons          -> home/
  /game        Homework 6 game (a copy)               -> game/
  /portfolio   Homework 8 portfolio (a copy)          -> portfolio/
  /api         NEW: "The Assembly" live data page     -> api/

Data routes used by the /api page (the browser never talks to the APIs directly)
  /data/delegates             every country, from the World Bank API
  /data/briefing/<iso2>       a short summary of one country, from Wikipedia

Render needs two things, both handled at the bottom of this file and in the
start command: listen on the PORT environment variable, on all addresses (0.0.0.0).
"""
import os
import time

import requests
from flask import Flask, abort, jsonify, redirect, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)  # we serve our own folders below


# ------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------
def folder(name):
    return os.path.join(BASE_DIR, name)


# A tiny "back to home" button added to the game and portfolio pages when they
# are served. The Homework 6 and 8 files themselves are not changed.
HOME_BUTTON = """
<a href="/" aria-label="Back to the home page" style="position:fixed;left:14px;bottom:14px;z-index:9999;
  font:700 12px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;
  color:#1A0F2E;background:#C8F560;padding:9px 13px;border-radius:999px;border:2px solid #1A0F2E;
  box-shadow:0 3px 0 #1A0F2E;opacity:.9">&#8592; Home</a>
"""


def page_with_home_button(dir_name):
    """Send <dir>/index.html with the home button added just before </body>."""
    path = os.path.join(folder(dir_name), "index.html")
    if not os.path.exists(path):
        abort(404)
    with open(path, encoding="utf-8") as f:
        html = f.read()
    if "</body>" in html:
        html = html.replace("</body>", HOME_BUTTON + "</body>", 1)
    else:
        html += HOME_BUTTON
    return html


# ------------------------------------------------------------------
# Pages
# ------------------------------------------------------------------
@app.route("/")
def home():
    return send_from_directory(folder("home"), "index.html")


@app.route("/home/<path:filename>")
def home_files(filename):
    return send_from_directory(folder("home"), filename)


# "/game" -> "/game/" so the game's own relative paths (style.css, script.js ...) work
@app.route("/game")
def game_redirect():
    return redirect("/game/", code=301)


@app.route("/game/")
def game():
    return page_with_home_button("game")


@app.route("/game/<path:filename>")
def game_files(filename):
    return send_from_directory(folder("game"), filename)


@app.route("/portfolio")
def portfolio_redirect():
    return redirect("/portfolio/", code=301)


@app.route("/portfolio/")
def portfolio():
    return page_with_home_button("portfolio")


@app.route("/portfolio/<path:filename>")
def portfolio_files(filename):
    return send_from_directory(folder("portfolio"), filename)


@app.route("/api")
def api_redirect():
    return redirect("/api/", code=301)


@app.route("/api/")
def api_page():
    return send_from_directory(folder("api"), "index.html")


@app.route("/api/<path:filename>")
def api_files(filename):
    return send_from_directory(folder("api"), filename)


# ------------------------------------------------------------------
# Live data: World Bank + Wikipedia, remembered for a while (cache)
# ------------------------------------------------------------------
CACHE_SECONDS = 30 * 60          # remember API answers for 30 minutes
_cache = {}                      # key -> (time_saved, data)

HEADERS = {"User-Agent": "RababAssembly/1.0 (Heuser College CS homework)"}
WORLD_BANK = "https://api.worldbank.org/v2"
WIKIPEDIA = "https://en.wikipedia.org/api/rest_v1/page/summary/"

# The World Bank writes some names "backwards" (e.g. "Korea, Rep."). Nicer names:
NICE_NAMES = {
    "Bahamas, The": "The Bahamas", "Gambia, The": "The Gambia",
    "Egypt, Arab Rep.": "Egypt", "Iran, Islamic Rep.": "Iran",
    "Korea, Rep.": "South Korea", "Korea, Dem. People's Rep.": "North Korea",
    "Yemen, Rep.": "Yemen", "Venezuela, RB": "Venezuela",
    "Micronesia, Fed. Sts.": "Federated States of Micronesia",
    "Congo, Dem. Rep.": "Democratic Republic of the Congo",
    "Congo, Rep.": "Republic of the Congo",
    "Hong Kong SAR, China": "Hong Kong", "Macao SAR, China": "Macau",
    "Lao PDR": "Laos", "Kyrgyz Republic": "Kyrgyzstan", "Slovak Republic": "Slovakia",
    "Turkiye": "Türkiye", "Viet Nam": "Vietnam", "Russian Federation": "Russia",
    "Syrian Arab Republic": "Syria", "Brunei Darussalam": "Brunei",
    "St. Lucia": "Saint Lucia", "St. Kitts and Nevis": "Saint Kitts and Nevis",
    "St. Vincent and the Grenadines": "Saint Vincent and the Grenadines",
    "St. Martin (French part)": "Saint Martin", "Sint Maarten (Dutch part)": "Sint Maarten",
    "Virgin Islands (U.S.)": "United States Virgin Islands",
    "Cote d'Ivoire": "Côte d'Ivoire", "Curacao": "Curaçao",
    "Sao Tome and Principe": "São Tomé and Príncipe", "Somalia, Fed. Rep.": "Somalia",
}


def cached(key, fetch):
    """Return a remembered answer if it is fresh; otherwise ask the API again.
    If the API fails but we have an older answer, use the older answer."""
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    try:
        data = fetch()
    except Exception:
        if hit:
            return hit[1]
        raise
    _cache[key] = (now, data)
    return data


def fetch_json(url, params=None):
    response = requests.get(url, params=params, headers=HEADERS, timeout=12)
    response.raise_for_status()
    return response.json()


def load_delegates():
    countries = fetch_json(f"{WORLD_BANK}/country", {"format": "json", "per_page": 400})[1]
    population = fetch_json(f"{WORLD_BANK}/country/all/indicator/SP.POP.TOTL",
                            {"format": "json", "per_page": 400, "mrnev": 1})[1] or []
    pop_by_code = {row["countryiso3code"]: (row["value"], row["date"]) for row in population}

    delegates = []
    for c in countries:
        if c["region"]["value"].strip() == "Aggregates":   # skip groups like "Arab World"
            continue
        pop, year = pop_by_code.get(c["id"], (None, None))
        delegates.append({
            "code": c["id"],
            "iso2": c["iso2Code"],
            "name": NICE_NAMES.get(c["name"], c["name"]),
            "region": c["region"]["value"].strip(),
            "regionId": c["region"]["id"],
            "income": c["incomeLevel"]["value"].strip(),
            "capital": c["capitalCity"] or "",
            "lat": c["latitude"], "lon": c["longitude"],
            "population": pop, "populationYear": year,
        })
    delegates.sort(key=lambda d: (d["region"], d["name"]))
    return delegates


@app.route("/data/delegates")
def data_delegates():
    try:
        return jsonify(cached("delegates", load_delegates))
    except Exception:
        return jsonify({"error": "The World Bank could not be reached right now."}), 502


@app.route("/data/briefing/<iso2>")
def data_briefing(iso2):
    try:
        delegates = cached("delegates", load_delegates)
    except Exception:
        return jsonify({"error": "No delegate list available."}), 502
    match = next((d for d in delegates if d["iso2"].upper() == iso2.upper()), None)
    if not match:
        return jsonify({"error": "Unknown delegation."}), 404

    def load():
        title = match["name"].replace(" ", "_")
        page = fetch_json(WIKIPEDIA + requests.utils.quote(title))
        return {
            "title": page.get("title", match["name"]),
            "extract": page.get("extract", ""),
            "image": (page.get("thumbnail") or {}).get("source"),
            "url": ((page.get("content_urls") or {}).get("desktop") or {}).get("page"),
        }

    try:
        return jsonify(cached("brief:" + match["iso2"], load))
    except Exception:
        return jsonify({"error": "No briefing notes for this delegation right now."}), 502


# ------------------------------------------------------------------
# Friendly error pages
# ------------------------------------------------------------------
@app.errorhandler(404)
def not_found(_error):
    return send_from_directory(folder("home"), "404.html"), 404


@app.errorhandler(500)
def server_error(_error):
    return send_from_directory(folder("home"), "404.html"), 500


# ------------------------------------------------------------------
# Run on your own computer:  python app.py   then open http://localhost:5000
# On Render, gunicorn starts the app instead (see README for the start command).
# ------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
