const https = require('https');
const http = require('http');
const VRC_API = 'api.vrchat.cloud';
const USER_AGENT = 'vrcmaps/1.0';

function vrchatRequest(path, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: VRC_API,
      path: '/api/1' + path,
      method: options.method || 'GET',
      headers: Object.assign({ 'User-Agent': USER_AGENT, 'Accept': 'application/json' }, options.headers || {})
    };
    var req = https.request(opts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function fetchWorld(id) {
  try {
    var world = await vrchatRequest('/worlds/' + id);
    return {
      id: world.id,
      name: world.name || '',
      description: world.description || '',
      author_id: world.authorId || '',
      author_name: world.authorName || '',
      capacity: world.capacity || 0,
      favorites: world.favorites || 0,
      visits: world.visits || 0,
      heat: world.heat || 0,
      popularity: world.popularity || 0,
      tags: world.tags || [],
      image_url: world.imageUrl || '',
      thumbnail_url: world.thumbnailImageUrl || '',
      version: world.version || 0,
      created_at: world.created_at || '',
      updated_at: world.updated_at || '',
      last_fetched: new Date().toISOString()
    };
  } catch(e) {
    console.error('fetchWorld error for ' + id + ':', e.message);
    return null;
  }
}

async function searchWorlds(query, opts) {
  opts = opts || {};
  var n = opts.n || 20;
  try {
    var params = new URLSearchParams({ search: query, n: n, sort: 'heat', releaseStatus: 'public' });
    var worlds = await vrchatRequest('/worlds?' + params.toString());
    return (worlds || []).map(function(w) {
      return {
        id: w.id, name: w.name || '', description: w.description || '',
        author_id: w.authorId || '', author_name: w.authorName || '',
        capacity: w.capacity || 0, favorites: w.favorites || 0,
        visits: w.visits || 0, heat: w.heat || 0, popularity: w.popularity || 0,
        tags: w.tags || [], image_url: w.imageUrl || '', thumbnail_url: w.thumbnailImageUrl || '',
        version: w.version || 0, created_at: w.created_at || '',
        updated_at: w.updated_at || '', last_fetched: new Date().toISOString()
      };
    });
  } catch(e) {
    console.error('searchWorlds error:', e.message);
    return [];
  }
}

async function fetchWorldInstances(worldId) {
  try {
    var instances = await vrchatRequest('/worlds/' + worldId + '/instances');
    return (instances || []).map(function(i) {
      return {
        id: i.id || '', name: i.name || '',
        player_count: i.n_users || i.occupants || 0,
        capacity: i.capacity || 0, region: i.region || '',
        type: i.type || '', created_at: i.created_at || ''
      };
    });
  } catch(e) {
    console.error('fetchWorldInstances error for ' + worldId + ':', e.message);
    return [];
  }
}

function downloadImage(url, destPath) {
  return new Promise(function(resolve, reject) {
    if (!url) return resolve(false);
    var proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': USER_AGENT } }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return resolve(false);
      var file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', function() { file.close(); resolve(true); });
      file.on('error', function() { fs.unlink(destPath, function() {}); resolve(false); });
    }).on('error', function() { resolve(false); });
  });
}

module.exports = { fetchWorld, searchWorlds, fetchWorldInstances, downloadImage };
