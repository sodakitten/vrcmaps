#!/usr/bin/env python3
# vrcmaps - VRChat World Browser
# Reads local VRCX database, fetches live data from VRChat API, serves as local web app.

import sqlite3
import json
import os
import sys
import time
import shutil
import threading
import webbrowser
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Fix Windows console encoding for CJK characters
if sys.platform == 'win32' and sys.stdout is not None:
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vrcmaps.log")

def log(msg):
    try:
        print(msg)
    except Exception:
        pass
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass

VRCX_DB = os.path.join(os.environ.get("APPDATA", ""), "VRCX", "VRCX.sqlite3")
COVER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "covers")
HTML_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
PORT = 3456
UA = "vrcmaps/2.0"

# ── VRChat API ──────────────────────────────────────────────

def api_get(path):
    url = f"https://api.vrchat.cloud/api/1{path}"
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=12) as res:
            return res.status, json.loads(res.read())
    except HTTPError as e:
        body = e.read().decode(errors="replace")
        try: body = json.loads(body)
        except: pass
        return e.code, body
    except Exception as e:
        return 0, str(e)

def download_image(url, dest, max_redirects=5):
    if not url or max_redirects <= 0:
        return False
    try:
        req = Request(url, headers={"User-Agent": UA})
        with urlopen(req, timeout=15) as res:
            if res.status in (301, 302):
                return download_image(res.headers.get("Location"), dest, max_redirects - 1)
            if res.status != 200:
                return False
            with open(dest, "wb") as f:
                f.write(res.read())
            return True
    except Exception:
        return False

# ── Data loading ────────────────────────────────────────────

def load_vrcx_favorites():
    if not os.path.exists(VRCX_DB):
        log("[vrcmaps] VRCX database not found: {VRCX_DB}")
        return []

    conn = sqlite3.connect(VRCX_DB)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    rows = cursor.execute("""
        SELECT f.group_name, f.world_id, f.created_at as fav_since,
               w.name, w.description, w.author_id, w.author_name,
               w.image_url, w.thumbnail_image_url, w.version,
               w.created_at, w.updated_at
        FROM favorite_world f
        LEFT JOIN cache_world w ON f.world_id = w.id
        ORDER BY f.group_name, f.created_at
    """).fetchall()

    conn.close()

    worlds = [dict(r) for r in rows]
    log("[vrcmaps] Found {len(worlds)} worlds in VRCX favorites")
    return worlds

def fetch_live_data(worlds):
    os.makedirs(COVER_DIR, exist_ok=True)

    for w in worlds:
        wid = w["world_id"]
        w["live"] = False
        w["heat"] = 0
        w["real_favorites"] = 0
        w["visits"] = 0
        w["popularity"] = 0
        w["capacity"] = 0
        w["tags"] = []
        w["cover_local"] = ""
        w["api_error"] = False

        status, data = api_get(f"/worlds/{wid}")
        if status == 200 and isinstance(data, dict) and data.get("name"):
            api = data
            w["name"] = api.get("name", w["name"])
            w["description"] = api.get("description", "") or w.get("description", "")
            w["author_name"] = api.get("authorName", w.get("author_name", ""))
            w["author_id"] = api.get("authorId", w.get("author_id", ""))
            w["heat"] = api.get("heat", 0)
            w["real_favorites"] = api.get("favorites", 0)
            w["visits"] = api.get("visits", 0)
            w["popularity"] = api.get("popularity", 0)
            w["capacity"] = api.get("capacity", 0)
            w["tags"] = api.get("tags", [])
            w["image_url"] = api.get("imageUrl", "") or w.get("image_url", "")
            w["thumbnail_image_url"] = api.get("thumbnailImageUrl", "") or w.get("thumbnail_image_url", "")
            w["version"] = api.get("version", w.get("version", 0))
            w["live"] = True

            thumb_url = w.get("thumbnail_image_url", "")
            img_url = w.get("image_url", "")

            if thumb_url:
                dest = os.path.join(COVER_DIR, f"{wid}_thumb.png")
                if download_image(thumb_url, dest):
                    w["cover_local"] = f"covers/{wid}_thumb.png"
            if not w["cover_local"] and img_url:
                dest = os.path.join(COVER_DIR, f"{wid}_cover.png")
                if download_image(img_url, dest):
                    w["cover_local"] = f"covers/{wid}_cover.png"

            cover_status = "yes" if w["cover_local"] else "no"
            log("[vrcmaps]   OK  {w['name']}  heat={w['heat']} fav={w['real_favorites']} visits={w['visits']} cover={cover_status}")
        else:
            w["api_error"] = True
            log("[vrcmaps]   ERR {w.get('name', wid)}  API status={status}")
    return worlds

# ── HTML generation ─────────────────────────────────────────

def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

def fm(n):
    if n >= 1000000:
        return f"{n/1000000:.1f}M"
    if n >= 1000:
        return f"{n/1000:.1f}K"
    return str(n)

def build_card(w, is_deleted):
    cover = f'<img src="{w["cover_local"]}" alt="" loading="lazy">' if w["cover_local"] else "&#127758;"
    badge = '<span class="gone">已删除</span>' if is_deleted else '<span class="live">在线</span>'
    desc = (w.get("description") or "")[:120]
    if len(w.get("description") or "") > 120:
        desc += "..."

    stats_parts = []
    if not is_deleted:
        if w["heat"]: stats_parts.append(f"&#128293; {fm(w['heat'])}")
        if w["real_favorites"]: stats_parts.append(f"&#11088; {fm(w['real_favorites'])}")
        if w["visits"]: stats_parts.append(f"&#128065; {fm(w['visits'])}")
        if w["capacity"]: stats_parts.append(f"&#128101; {w['capacity']}")
    stats_html = f'<div class="stats">{" &middot; ".join(stats_parts)}</div>' if stats_parts else ""
    if is_deleted:
        stats_html = '<div class="stats del-note">VRChat API returned 404 &mdash; world may be deleted or private</div>'

    name_html = esc(w.get("name") or w["world_id"])
    if not is_deleted:
        name_html = f'<a href="https://vrchat.com/home/world/{w["world_id"]}" target="_blank">{name_html}</a>'

    desc_html = f'<div class="desc">{esc(desc)}</div>' if desc else ""

    return f"""<div class="card{' deleted' if is_deleted else ''}">
    <div class="cover">{cover}</div>
    <div class="body">
        <h3>{name_html}{badge}</h3>
        <div class="author">&#128100;  {esc(w.get('author_name') or 'Unknown')}</div>
        {desc_html}{stats_html}
    </div>
</div>"""

def build_html(worlds):
    groups = {}
    for w in worlds:
        g = w.get("group_name") or "未分类"
        groups.setdefault(g, []).append(w)

    group_names = list(groups.keys())

    # Build tab buttons
    tabs_html = ""
    for i, gname in enumerate(group_names):
        active = "active" if i == 0 else ""
        count = len(groups[gname])
        tabs_html += f'<button class="tab-btn {active}" onclick="switchTab(\'{esc(gname)}\')">{esc(gname)}<span class="tab-count">{count}</span></button>'

    # Build tab content sections
    sections = ""
    for i, (gname, gworlds) in enumerate(groups.items()):
        alive = [w for w in gworlds if w["live"]]
        dead = [w for w in gworlds if not w["live"]]
        cards = "".join(build_card(w, False) for w in alive)
        cards += "".join(build_card(w, True) for w in dead)
        visible = "" if i == 0 else " hidden"
        sections += f'<div class="tab-content{visible}" id="tab-{esc(gname)}">'
        sections += f'<div class="group-header">{esc(gname)} <span class="group-count">{len(gworlds)} 个世界</span></div>'
        sections += f'<div class="grid">{cards}</div></div>'

    total_alive = sum(1 for w in worlds if w["live"])
    total_dead = sum(1 for w in worlds if not w["live"])
    now = time.strftime("%Y-%m-%d %H:%M", time.localtime())

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>vrcmaps &middot; VRChat 世界收藏</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;line-height:1.6}}
header{{background:#161b22;border-bottom:1px solid #30363d;padding:20px 24px;text-align:center}}
header h1{{font-size:1.4em;color:#58a6ff}}
header .sub{{color:#8b949e;font-size:0.85em;margin-top:4px}}
.header-stats{{color:#8b949e;font-size:0.8em;margin-top:10px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}}
.hs-live{{color:#3fb950}}
.hs-dead{{color:#f85149}}
.hs-time{{color:#484f58}}
main{{max-width:960px;margin:0 auto;padding:24px}}
/* Tab bar */
.tab-bar{{display:flex;gap:6px;margin-bottom:24px;flex-wrap:wrap;justify-content:center}}
.tab-btn{{padding:8px 18px;border-radius:20px;border:1px solid #30363d;background:#161b22;color:#8b949e;cursor:pointer;font-size:0.9em;transition:all 0.2s}}
.tab-btn:hover{{border-color:#58a6ff;color:#e6edf3}}
.tab-btn.active{{background:rgba(88,166,255,0.15);color:#58a6ff;border-color:#58a6ff}}
.tab-count{{font-size:0.75em;color:#484f58;margin-left:6px}}
.tab-btn.active .tab-count{{color:#58a6ff}}
.tab-content.hidden{{display:none}}
/* Info box */
.info-box{{background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.15);border-radius:8px;padding:12px 18px;margin-bottom:24px;font-size:0.85em;color:#8b949e;line-height:1.6;text-align:center}}
.info-box a{{color:#58a6ff}}
/* Group */
.group-header{{font-size:1.0em;font-weight:600;color:#f0883e;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #30363d}}
.group-count{{font-weight:400;font-size:0.8em;color:#8b949e;margin-left:8px}}
/* Grid */
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}}
.card{{background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;transition:border-color 0.2s;display:flex;flex-direction:column}}
.card:hover{{border-color:#58a6ff}}
.card.deleted{{opacity:0.6}}
.card.deleted:hover{{opacity:0.85;border-color:#f85149}}
.cover{{height:160px;background:#21262d;display:flex;align-items:center;justify-content:center;font-size:3em;overflow:hidden;position:relative}}
.cover img{{width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0}}
.body{{padding:16px;flex:1;display:flex;flex-direction:column}}
.body h3{{font-size:1em;margin-bottom:4px}}
.body h3 a{{color:#58a6ff;text-decoration:none}}
.body h3 a:hover{{text-decoration:underline}}
.live{{display:inline-block;background:rgba(63,185,80,0.12);color:#3fb950;padding:1px 6px;border-radius:6px;font-size:0.65em;margin-left:6px;vertical-align:middle;border:1px solid rgba(63,185,80,0.25)}}
.gone{{display:inline-block;background:rgba(248,81,73,0.12);color:#f85149;padding:1px 6px;border-radius:6px;font-size:0.65em;margin-left:6px;vertical-align:middle;border:1px solid rgba(248,81,73,0.25)}}
.author{{color:#8b949e;font-size:0.8em;margin-bottom:6px}}
.desc{{color:#c9d1d9;font-size:0.83em;line-height:1.5;margin-bottom:8px;flex:1}}
.stats{{color:#8b949e;font-size:0.78em;margin-top:auto}}
.del-note{{color:#f85149;font-size:0.75em}}
footer{{text-align:center;color:#484f58;font-size:0.8em;padding:24px;border-top:1px solid #30363d;margin-top:24px}}
footer a{{color:#58a6ff;text-decoration:none}}
@media(max-width:600px){{.grid{{grid-template-columns:1fr}}.tab-bar{{gap:4px}}.tab-btn{{padding:6px 12px;font-size:0.8em}}}}
</style>
</head>
<body>
<header>
<h1>vrcmaps</h1>
<div class="sub">VRChat 世界收藏 &mdash; 自动读取本机 VRCX 收藏夹</div>
<div class="header-stats">
    <span class="hs-live">{total_alive} 在线</span>
    <span class="hs-dead">{total_dead} 已删除</span>
    <span class="hs-time">更新于 {now}</span>
</div>
</header>
<main>
<div class="info-box">
    数据自动从本机 VRCX 数据库读取，通过 VRChat 公开 API 获取实时数据与封面。
    <br><a href="/" style="color:#58a6ff">刷新页面</a>
</div>
<div class="tab-bar">{tabs_html}</div>
{sections}
</main>
<footer>
    <p>vrcmaps &middot; <a href="https://github.com/sodakitten/vrcmaps" target="_blank">github.com/sodakitten/vrcmaps</a></p>
</footer>
<script>
function switchTab(name) {{
    document.querySelectorAll('.tab-btn').forEach(function(b) {{ b.classList.remove('active'); }});
    document.querySelectorAll('.tab-content').forEach(function(c) {{ c.classList.add('hidden'); }});
    var btn = document.querySelector('.tab-btn[onclick*="'+name+'"]');
    if(btn) btn.classList.add('active');
    var tab = document.getElementById('tab-'+name);
    if(tab) tab.classList.remove('hidden');
}}
</script>
</body>
</html>"""

def main():
    log("[vrcmaps] Starting...")
    write_loading_page()

    # Start server immediately so browser can connect
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    # Load data in background
    log("[vrcmaps] VRCX database: " + VRCX_DB)
    worlds = load_vrcx_favorites()
    if not worlds:
        log("[vrcmaps] No worlds found.")
        input("Press Enter to exit...")
        return

    worlds = fetch_live_data(worlds)
    html = build_html(worlds)
    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html)
    log("[vrcmaps] Data ready. Refresh your browser.")
    log("[vrcmaps] Ready. R = refresh, Q = quit.")
    try:
        while True:
            try:
                cmd = input().strip().lower()
                if cmd == 'r':
                    log("[vrcmaps] Refreshing...")
                    worlds = load_vrcx_favorites()
                    if worlds:
                        worlds = fetch_live_data(worlds)
                        html = build_html(worlds)
                        with open(HTML_PATH, "w", encoding="utf-8") as f:
                            f.write(html)
                        live = sum(1 for w in worlds if w["live"])
                        dead = sum(1 for w in worlds if not w["live"])
                        log("[vrcmaps] Done. {} live, {} deleted".format(live, dead))
                    else:
                        log("[vrcmaps] No worlds found")
                elif cmd == 'q':
                    break
                else:
                    log("[vrcmaps] Unknown: " + cmd + ". R = refresh, Q = quit")
            except EOFError:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    log("[vrcmaps] Shutting down...")

if __name__ == "__main__":
    main()
