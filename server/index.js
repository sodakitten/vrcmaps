const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const initSqlJs = require('sql.js');

const VRCX_DB = 'C:/Users/Administrator/AppData/Roaming/VRCX/VRCX.sqlite3';
const VRCX_WORLD_DB = 'C:/Users/Administrator/AppData/Roaming/VRCX/VRCX-WorldData.db';
const COVER_DIR = path.join(__dirname, 'public', 'covers');
const HTML_PATH = path.join(__dirname, 'public', 'index.html');
const UA = 'vrcmaps/1.0';

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- VRChat API ----
function apiGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', e => reject(e)).setTimeout(12000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function downloadImage(url, dest) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    function download(u, maxRedirects) {
      maxRedirects = maxRedirects || 5;
      const proto = u.startsWith('https') ? https : http;
      const req = proto.get(u, { headers: { 'User-Agent': UA } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (maxRedirects <= 0) return resolve(false);
          return download(res.headers.location, maxRedirects - 1);
        }
        if (res.statusCode !== 200) return resolve(false);
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error', () => { try { fs.unlinkSync(dest); } catch(e) {} resolve(false); });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(15000, () => { req.destroy(); resolve(false); });
    }
    download(url);
  });
}

// ---- Data loading ----
async function loadData() {
  console.log('[vrcmaps] Reading VRCX database...');
  const SQL = await initSqlJs();
  
  // Read VRCX main DB
  let vrcxDb;
  try {
    vrcxDb = new SQL.Database(fs.readFileSync(VRCX_DB));
  } catch(e) {
    console.log('[vrcmaps] Cannot open VRCX DB: ' + e.message);
    return [];
  }
  
  // Join favorite_world with cache_world to get full data
  const result = vrcxDb.exec(
    'SELECT f.group_name, f.world_id, f.created_at as fav_since, ' +
    'w.name, w.description, w.author_id, w.author_name, w.image_url, w.thumbnail_image_url, ' +
    'w.version, w.created_at, w.updated_at ' +
    'FROM favorite_world f LEFT JOIN cache_world w ON f.world_id = w.id ' +
    'ORDER BY f.group_name, f.created_at'
  );
  
  if (result.length === 0) {
    console.log('[vrcmaps] No worlds found in VRCX database');
    return [];
  }
  
  const cols = result[0].columns;
  const worlds = result[0].values.map(row => {
    const w = {};
    cols.forEach((c, i) => { w[c] = row[i]; });
    return w;
  });
  
  console.log('[vrcmaps] Found ' + worlds.length + ' worlds in VRCX favorites');
  
  // Fetch live data from VRChat API + download covers
  if (!fs.existsSync(COVER_DIR)) fs.mkdirSync(COVER_DIR, { recursive: true });
  
  for (const w of worlds) {
    w.live = false;
    w.heat = 0;
    w.realFavorites = 0;
    w.visits = 0;
    w.popularity = 0;
    w.cover_local = '';
    w.thumb_local = '';
    w.api_error = false;
    
    try {
      const res = await apiGet('https://api.vrchat.cloud/api/1/worlds/' + w.world_id);
      if (res.status === 200 && res.body && res.body.name) {
        const api = res.body;
        w.name = api.name || w.name;
        w.description = api.description || w.description || '';
        w.author_name = api.authorName || w.author_name || '';
        w.author_id = api.authorId || w.author_id || '';
        w.heat = api.heat || 0;
        w.realFavorites = api.favorites || 0;
        w.visits = api.visits || 0;
        w.popularity = api.popularity || 0;
        w.capacity = api.capacity || 0;
        w.tags = api.tags || [];
        w.image_url = api.imageUrl || w.image_url || '';
        w.thumbnail_image_url = api.thumbnailImageUrl || w.thumbnail_image_url || '';
        w.version = api.version || w.version || 0;
        w.live = true;
        
        // Download covers
        if (w.thumbnail_image_url) {
          const dest = path.join(COVER_DIR, w.world_id + '_thumb.png');
          const ok = await downloadImage(w.thumbnail_image_url, dest);
          if (ok) w.thumb_local = 'covers/' + w.world_id + '_thumb.png';
        }
        if (w.image_url && !w.thumb_local) {
          const dest = path.join(COVER_DIR, w.world_id + '_cover.png');
          const ok = await downloadImage(w.image_url, dest);
          if (ok) w.cover_local = 'covers/' + w.world_id + '_cover.png';
        }
        if (w.thumb_local) w.cover_local = w.thumb_local; // prefer thumbnail
        console.log('[vrcmaps]   ✓ ' + w.name + ' (heat:' + w.heat + ' fav:' + w.realFavorites + ' visits:' + w.visits + ' cover:' + (w.cover_local ? 'yes' : 'no') + ')');
      } else {
        w.api_error = true;
        console.log('[vrcmaps]   ✗ ' + (w.name || w.world_id) + ' (API ' + res.status + ')');
      }
    } catch(e) {
      w.api_error = true;
      console.log('[vrcmaps]   ✗ ' + (w.name || w.world_id) + ' (err: ' + e.message + ')');
    }
  }
  
  return worlds;
}

// ---- HTML Generation ----
function fm(n) {
  if (!n) return '0';
  return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
}
function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildHTML(worlds) {
  // Group by group_name
  const groups = {};
  for (const w of worlds) {
    const g = w.group_name || '未分类';
    if (!groups[g]) groups[g] = [];
    groups[g].push(w);
  }
  
  let groupSections = '';
  for (const [groupName, groupWorlds] of Object.entries(groups)) {
    const alive = groupWorlds.filter(w => w.live);
    const dead = groupWorlds.filter(w => !w.live);
    
    let cards = '';
    // Live worlds first
    for (const w of alive) {
      cards += buildCard(w, false);
    }
    // Then deleted/private worlds
    for (const w of dead) {
      cards += buildCard(w, true);
    }
    
    groupSections += '<div class="group-section">\n' +
      '<div class="group-header">📂 ' + esc(groupName) + ' <span class="group-count">' + groupWorlds.length + ' 个世界</span></div>\n' +
      '<div class="grid">' + cards + '</div>\n' +
      '</div>\n';
  }
  
  const totalAlive = worlds.filter(w => w.live).length;
  const totalDead = worlds.filter(w => !w.live).length;
  
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>vrcmaps · VRChat 世界收藏</title>\n' +
    CSS + '\n</head>\n<body>\n' +
    '<header>\n<h1>🗺️ vrcmaps</h1>\n' +
    '<div class="sub">自动读取本机 VRCX 收藏 · VRChat API 实时数据</div>\n' +
    '<div class="header-stats"><span class="hs-live">🟢 可用 ' + totalAlive + '</span> ' +
    (totalDead > 0 ? '<span class="hs-dead">🗑️ 已删除 ' + totalDead + '</span> ' : '') +
    '<span class="hs-time">更新于 ' + new Date().toLocaleString('zh-CN') + '</span></div>\n' +
    '</header>\n' +
    '<main>\n' +
    '<div class="info-box">💡 数据自动从本机 <b>VRCX 客户端数据库</b>读取，通过 <b>VRChat 公开 API</b> 获取实时热度/收藏/访问量，封面图从 VRChat CDN 下载本地缓存。' +
    '<br><a href="/api/refresh" style="color:#58a6ff">🔄 点击刷新数据</a></div>\n' +
    groupSections +
    '</main>\n' +
    '<footer><p>数据来源：VRChat API + 本机 VRCX 客户端 · <a href="https://github.com/sodakitten/vrcmaps" target="_blank">github.com/sodakitten/vrcmaps</a></p></footer>\n' +
    '</body>\n</html>';
}

function buildCard(w, isDeleted) {
  const cover = w.cover_local ? '<img src="' + w.cover_local + '" alt="" loading="lazy">' : '🌍';
  const badge = isDeleted ? '<span class="gone">已删除</span>' : '<span class="live">实时</span>';
  const desc = (w.description || '').substring(0, 120);
  const descHtml = desc ? '<div class="desc">' + esc(desc) + (w.description && w.description.length > 120 ? '...' : '') + '</div>' : '';
  
  let statsHtml = '';
  if (!isDeleted) {
    const parts = [];
    if (w.heat > 0) parts.push('🔥 ' + fm(w.heat));
    if (w.realFavorites > 0) parts.push('⭐ ' + fm(w.realFavorites));
    if (w.visits > 0) parts.push('👁 ' + fm(w.visits));
    if (w.capacity > 0) parts.push('👥 ' + w.capacity);
    statsHtml = parts.length ? '<div class="stats">' + parts.join(' · ') + '</div>' : '';
  } else {
    statsHtml = '<div class="stats del-note">VRChat API 返回 404 —— 世界可能已删除或设为私有</div>';
  }
  
  const nameHtml = isDeleted ? esc(w.name || w.world_id) : '<a href="https://vrchat.com/home/world/' + w.world_id + '" target="_blank">' + esc(w.name || w.world_id) + '</a>';
  
  return '<div class="card' + (isDeleted ? ' deleted' : '') + '">' +
    '<div class="cover">' + cover + '</div>' +
    '<div class="body">' +
    '<h3>' + nameHtml + badge + '</h3>' +
    '<div class="author">👤 ' + esc(w.author_name || '未知') + '</div>' +
    descHtml + statsHtml +
    '</div></div>';
}

const CSS = '<style>\n' +
  '*{margin:0;padding:0;box-sizing:border-box}\n' +
  'body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;line-height:1.6}\n' +
  'header{background:#161b22;border-bottom:1px solid #30363d;padding:20px 24px;text-align:center}\n' +
  'header h1{font-size:1.4em;color:#58a6ff}\n' +
  'header .sub{color:#8b949e;font-size:0.85em;margin-top:4px}\n' +
  '.header-stats{color:#8b949e;font-size:0.8em;margin-top:10px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}\n' +
  '.hs-live{color:#3fb950}\n' +
  '.hs-dead{color:#f85149}\n' +
  '.hs-time{color:#484f58}\n' +
  'main{max-width:960px;margin:0 auto;padding:24px}\n' +
  '.info-box{background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.15);border-radius:8px;padding:12px 18px;margin-bottom:24px;font-size:0.85em;color:#8b949e;line-height:1.6}\n' +
  '.info-box a{color:#58a6ff}\n' +
  '.group-section{margin-bottom:32px}\n' +
  '.group-header{font-size:1.15em;font-weight:600;color:#f0883e;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #30363d}\n' +
  '.group-count{font-weight:400;font-size:0.8em;color:#8b949e;margin-left:8px}\n' +
  '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}\n' +
  '.card{background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;transition:border-color 0.2s;display:flex;flex-direction:column}\n' +
  '.card:hover{border-color:#58a6ff}\n' +
  '.card.deleted{opacity:0.6}\n' +
  '.card.deleted:hover{opacity:0.85;border-color:#f85149}\n' +
  '.cover{height:160px;background:#21262d;display:flex;align-items:center;justify-content:center;font-size:3em;overflow:hidden;position:relative}\n' +
  '.cover img{width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0}\n' +
  '.body{padding:16px;flex:1;display:flex;flex-direction:column}\n' +
  '.body h3{font-size:1em;margin-bottom:4px}\n' +
  '.body h3 a{color:#58a6ff;text-decoration:none}\n' +
  '.body h3 a:hover{text-decoration:underline}\n' +
  '.live{display:inline-block;background:rgba(63,185,80,0.12);color:#3fb950;padding:1px 6px;border-radius:6px;font-size:0.65em;margin-left:6px;vertical-align:middle;border:1px solid rgba(63,185,80,0.25)}\n' +
  '.gone{display:inline-block;background:rgba(248,81,73,0.12);color:#f85149;padding:1px 6px;border-radius:6px;font-size:0.65em;margin-left:6px;vertical-align:middle;border:1px solid rgba(248,81,73,0.25)}\n' +
  '.author{color:#8b949e;font-size:0.8em;margin-bottom:6px}\n' +
  '.desc{color:#c9d1d9;font-size:0.83em;line-height:1.5;margin-bottom:8px;flex:1}\n' +
  '.stats{color:#8b949e;font-size:0.78em;margin-top:auto}\n' +
  '.del-note{color:#f85149;font-size:0.75em}\n' +
  'footer{text-align:center;color:#484f58;font-size:0.8em;padding:24px;border-top:1px solid #30363d;margin-top:24px}\n' +
  'footer a{color:#58a6ff;text-decoration:none}\n' +
  '@media(max-width:600px){.grid{grid-template-columns:1fr}}\n' +
'</style>';

// ---- Routes ----
let cachedWorlds = null;
let cachedHTML = null;

app.get('/api/refresh', async (req, res) => {
  try {
    cachedWorlds = await loadData();
    cachedHTML = buildHTML(cachedWorlds);
    fs.writeFileSync(HTML_PATH, cachedHTML, 'utf8');
    res.json({ ok: true, worlds: cachedWorlds.length, alive: cachedWorlds.filter(w => w.live).length, deleted: cachedWorlds.filter(w => !w.live).length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/worlds', (req, res) => {
  if (!cachedWorlds) return res.json([]);
  res.json(cachedWorlds.map(w => ({
    world_id: w.world_id, name: w.name, group_name: w.group_name,
    author_name: w.author_name, description: w.description,
    heat: w.heat, favorites: w.realFavorites, visits: w.visits,
    capacity: w.capacity, cover: w.cover_local, live: w.live
  })));
});

app.get('*', (req, res) => {
  if (cachedHTML) {
    res.send(cachedHTML);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'loading.html'));
  }
});

// ---- Startup ----
(async () => {
  console.log('[vrcmaps] Starting...');
  
  // Write loading page
  if (!fs.existsSync(path.join(__dirname, 'public'))) fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'public', 'loading.html'),
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="2"><title>vrcmaps</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.loader{color:#58a6ff;font-size:2em;margin-bottom:12px}.msg{color:#8b949e}</style></head><body><div><div class="loader">⏳</div><div class="msg">正在从 VRCX 读取收藏数据…</div></div></body></html>', 'utf8');
  
  app.listen(PORT, () => {
    console.log('[vrcmaps] Server on http://localhost:' + PORT);
  });
  
  // Load data in background
  try {
    cachedWorlds = await loadData();
    cachedHTML = buildHTML(cachedWorlds);
    fs.writeFileSync(HTML_PATH, cachedHTML, 'utf8');
    console.log('[vrcmaps] Ready! ' + cachedWorlds.filter(w => w.live).length + ' live, ' + cachedWorlds.filter(w => !w.live).length + ' deleted');
  } catch(e) {
    console.log('[vrcmaps] Load error: ' + e.message);
  }
})();
