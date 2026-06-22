// vrcmaps - VRChat World Browser
const state = {
  page: 1,
  limit: 24,
  search: '',
  sort: 'heat',
  worlds: [],
  total: 0,
  totalPages: 0
};

// --- API helpers ---
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    ...(opts.body ? { body: JSON.stringify(opts.body), method: opts.method || 'POST' } : {})
  });
  return res.json();
}

// --- Load worlds ---
async function loadWorlds() {
  document.getElementById('worldGrid').innerHTML = '<div class="loading">Loading worlds...</div>';
  const data = await api('/worlds?page=' + state.page + '&limit=' + state.limit + '&search=' + encodeURIComponent(state.search) + '&sort=' + state.sort);
  state.worlds = data.worlds || [];
  state.total = data.total || 0;
  state.totalPages = data.totalPages || 0;
  renderGrid();
  renderPagination();
}

// --- Render ---
function renderGrid() {
  const grid = document.getElementById('worldGrid');
  if (state.worlds.length === 0) {
    grid.innerHTML = '<div class="empty">No worlds found. Try searching on VRChat or looking up a world ID.</div>';
    return;
  }
  grid.innerHTML = state.worlds.map(w => {
    const coverSrc = w.cover_local ? w.cover_local : (w.thumbnail_local || '');
    const coverHtml = coverSrc
      ? '<img src="' + coverSrc + '" alt="' + esc(w.name) + '" loading="lazy" onerror="this.parentElement.innerHTML=\\'<div class=no-cover>🌍</div>\\'">'
      : '<div class="no-cover">🌍</div>';
    const tagsHtml = (w.tags || []).slice(0, 4).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<div class="world-card" onclick="openWorld(\'' + w.id + '\')">'
      + '<div class="card-cover">' + coverHtml + '</div>'
      + '<div class="card-body">'
      + '<h3>' + esc(w.name || w.id) + '</h3>'
      + '<div class="card-author">by ' + esc(w.author_name || 'Unknown') + '</div>'
      + '<div class="card-stats">'
      + '<span class="heat" title="Heat">🔥 ' + fmtNum(w.heat || 0) + '</span>'
      + '<span title="Favorites">⭐ ' + fmtNum(w.favorites || 0) + '</span>'
      + '<span title="Visits">👁 ' + fmtNum(w.visits || 0) + '</span>'
      + '<span title="Capacity">👥 ' + (w.capacity || 0) + '</span>'
      + '</div>'
      + (tagsHtml ? '<div class="card-tags">' + tagsHtml + '</div>' : '')
      + '</div></div>';
  }).join('');
}

function renderPagination() {
  const pg = document.getElementById('pagination');
  if (state.totalPages <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  const maxBtns = 7;
  let start = Math.max(1, state.page - Math.floor(maxBtns / 2));
  let end = Math.min(state.totalPages, start + maxBtns - 1);
  if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
  if (state.page > 1) html += '<button class="page-btn" onclick="goPage(' + (state.page - 1) + ')">←</button>';
  for (let i = start; i <= end; i++) {
    html += '<button class="page-btn' + (i === state.page ? ' active' : '') + '" onclick="goPage(' + i + ')">' + i + '</button>';
  }
  if (state.page < state.totalPages) html += '<button class="page-btn" onclick="goPage(' + (state.page + 1) + ')">→</button>';
  pg.innerHTML = html;
}

function goPage(p) { state.page = p; loadWorlds(); window.scrollTo(0, 0); }

// --- Search ---
async function doSearch() {
  state.search = document.getElementById('searchInput').value.trim();
  state.page = 1;
  if (state.search) {
    // Also trigger API search to fetch new worlds
    await api('/worlds/search', { body: { query: state.search, n: 30 } });
    showToast('Searching VRChat for "' + state.search + '"...');
  }
  loadWorlds();
}

async function doLookup() {
  const id = document.getElementById('searchInput').value.trim();
  if (!id) return;
  showToast('Looking up world ' + id + '...');
  const data = await api('/worlds/lookup', { body: { id } });
  if (data.error) { showToast('Error: ' + data.error); return; }
  showToast('World found: ' + data.name);
  openWorld(id);
  loadWorlds();
}

// --- World Detail Modal ---
async function openWorld(id) {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalContent').innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Loading...</div>';
  
  const w = await api('/worlds/' + id);
  if (w.error) {
    document.getElementById('modalContent').innerHTML = '<div style="padding:40px;text-align:center;color:var(--red)">' + w.error + '</div>';
    return;
  }
  
  const coverSrc = w.cover_local || w.thumbnail_local || '';
  const coverHtml = coverSrc
    ? '<img src="' + coverSrc + '" alt="' + esc(w.name) + '" onerror="this.parentElement.innerHTML=\\'<div class=no-cover>🌍</div>\\'">'
    : '<div class="no-cover">🌍</div>';
  
  const instances = w.instances || [];
  const instancesHtml = instances.length > 0
    ? instances.map(i => '<div class="instance-row">'
      + '<span>' + esc(i.name || i.id) + '</span>'
      + '<span class="players">' + i.player_count + ' / ' + i.capacity + '</span>'
      + '<span class="type">' + esc(i.type || '') + '</span>'
      + '<span class="region">' + esc(i.region || '') + '</span>'
      + '</div>').join('')
    : '<div class="no-instances">No active public instances</div>';
  
  const tagsHtml = (w.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
  
  document.getElementById('modalContent').innerHTML =
    '<div class="modal-cover">' + coverHtml + '</div>'
    + '<div class="modal-info">'
    + '<h2>' + esc(w.name || w.id) + '</h2>'
    + '<div class="author">by ' + esc(w.author_name || 'Unknown') + (w.author_id ? ' · <a href="https://vrchat.com/home/user/' + w.author_id + '" target="_blank" style="color:var(--accent)">Profile</a>' : '') + '</div>'
    + (w.description ? '<div class="desc">' + esc(w.description) + '</div>' : '')
    + '<div class="stat-grid">'
    + '<div class="stat-box"><div class="val">🔥 ' + fmtNum(w.heat || 0) + '</div><div class="lbl">Heat</div></div>'
    + '<div class="stat-box"><div class="val">⭐ ' + fmtNum(w.favorites || 0) + '</div><div class="lbl">Favorites</div></div>'
    + '<div class="stat-box"><div class="val">👁 ' + fmtNum(w.visits || 0) + '</div><div class="lbl">Visits</div></div>'
    + '<div class="stat-box"><div class="val">👥 ' + (w.capacity || 0) + '</div><div class="lbl">Capacity</div></div>'
    + (w.popularity ? '<div class="stat-box"><div class="val">📊 ' + fmtNum(w.popularity) + '</div><div class="lbl">Popularity</div></div>' : '')
    + '</div>'
    + (tagsHtml ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' + tagsHtml + '</div>' : '')
    + '<div class="instances-section"><h3>Public Instances (' + instances.length + ')</h3>' + instancesHtml + '</div>'
    + '<div class="modal-actions">'
    + '<a class="primary" href="https://vrchat.com/home/world/' + w.id + '" target="_blank">Open in VRChat</a>'
    + '<button onclick="refreshInstances(\'' + w.id + '\')">🔄 Refresh Instances</button>'
    + '<button onclick="fetchCover(\'' + w.id + '\')">🖼 Fetch Cover</button>'
    + '</div>'
    + '</div>';
}

async function refreshInstances(id) {
  showToast('Refreshing instances...');
  await api('/worlds/' + id + '/instances', { method: 'POST' });
  openWorld(id);
}

async function fetchCover(id) {
  showToast('Fetching cover...');
  await api('/covers/fetch', { method: 'POST' });
  openWorld(id);
  loadWorlds();
}

// --- Fetch missing covers ---
async function fetchAllCovers() {
  showToast('Fetching missing covers...');
  const res = await api('/covers/fetch', { method: 'POST' });
  showToast('Fetched ' + (res.fetched || 0) + ' covers');
  loadWorlds();
}

// --- Stats ---
async function loadStats() {
  try {
    const stats = await api('/stats');
    document.getElementById('statWorlds').textContent = stats.totalWorlds || 0;
    document.getElementById('statPlayers').textContent = stats.totalPlayers || 0;
  } catch(e) {}
}

// --- Modal close ---
document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === this) document.getElementById('modalOverlay').classList.remove('open');
});
document.getElementById('modalClose').addEventListener('click', function() {
  document.getElementById('modalOverlay').classList.remove('open');
});

// --- Sort buttons ---
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    state.sort = this.dataset.sort;
    state.page = 1;
    loadWorlds();
  });
});

// --- Search ---
document.getElementById('searchBtn').addEventListener('click', doSearch);
document.getElementById('searchInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doSearch();
});
document.getElementById('lookupBtn').addEventListener('click', doLookup);
document.getElementById('refreshCovers').addEventListener('click', fetchAllCovers);

// --- Toast ---
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// --- Utils ---
function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtNum(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n); }

// --- Init ---
loadWorlds();
loadStats();
