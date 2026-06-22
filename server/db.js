const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'vrcmaps.db');
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  initSchema();
  return db;
}

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function initSchema() {
  db.run("CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', author_id TEXT DEFAULT '', author_name TEXT DEFAULT '', capacity INTEGER DEFAULT 0, favorites INTEGER DEFAULT 0, visits INTEGER DEFAULT 0, heat INTEGER DEFAULT 0, popularity INTEGER DEFAULT 0, tags TEXT DEFAULT '[]', image_url TEXT DEFAULT '', thumbnail_url TEXT DEFAULT '', cover_local TEXT DEFAULT '', thumbnail_local TEXT DEFAULT '', version INTEGER DEFAULT 0, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '', last_fetched TEXT DEFAULT '')");
  db.run("CREATE TABLE IF NOT EXISTS world_instances (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, name TEXT DEFAULT '', player_count INTEGER DEFAULT 0, capacity INTEGER DEFAULT 0, region TEXT DEFAULT '', type TEXT DEFAULT '', created_at TEXT DEFAULT '')");
  db.run("CREATE INDEX IF NOT EXISTS idx_worlds_heat ON worlds(heat DESC)");
  db.run("CREATE INDEX IF NOT EXISTS idx_worlds_fav ON worlds(favorites DESC)");
  db.run("CREATE INDEX IF NOT EXISTS idx_inst_world ON world_instances(world_id)");
  saveDb();
}

function upsertWorld(world) {
  var existing = db.exec("SELECT id FROM worlds WHERE id = ?", [world.id]);
  var tags = JSON.stringify(world.tags || []);
  var cv = world.cover_local || "";
  var tv = world.thumbnail_local || "";
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run("UPDATE worlds SET name=?,description=?,author_id=?,author_name=?,capacity=?,favorites=?,visits=?,heat=?,popularity=?,tags=?,image_url=?,thumbnail_url=?,cover_local=CASE WHEN LENGTH(?)>0 THEN ? ELSE cover_local END,thumbnail_local=CASE WHEN LENGTH(?)>0 THEN ? ELSE thumbnail_local END,version=?,created_at=?,updated_at=?,last_fetched=? WHERE id=?",
      [world.name, world.description, world.author_id, world.author_name, world.capacity, world.favorites, world.visits, world.heat, world.popularity, tags, world.image_url, world.thumbnail_url, cv, cv, tv, tv, world.version, world.created_at, world.updated_at, world.last_fetched, world.id]);
  } else {
    db.run("INSERT INTO worlds (id,name,description,author_id,author_name,capacity,favorites,visits,heat,popularity,tags,image_url,thumbnail_url,cover_local,thumbnail_local,version,created_at,updated_at,last_fetched) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [world.id, world.name, world.description, world.author_id, world.author_name, world.capacity, world.favorites, world.visits, world.heat, world.popularity, tags, world.image_url, world.thumbnail_url, cv, tv, world.version || 0, world.created_at, world.updated_at, world.last_fetched]);
  }
  saveDb();
}

function rowToObj(columns, values) {
  var obj = {};
  columns.forEach(function(c, i) { obj[c] = values[i]; });
  if (obj.tags) {
    try { obj.tags = JSON.parse(obj.tags); } catch(e) { obj.tags = []; }
  }
  return obj;
}

function getWorlds(opts) {
  opts = opts || {};
  var page = opts.page || 1;
  var limit = opts.limit || 24;
  var search = opts.search || "";
  var sort = opts.sort || "heat";
  var offset = (page - 1) * limit;
  var where = "";
  var params = [];
  if (search) {
    where = "WHERE name LIKE ? OR description LIKE ? OR author_name LIKE ?";
    var q = "%" + search + "%";
    params.push(q, q, q);
  }
  var sortCols = { heat: "heat", favorites: "favorites", visits: "visits", name: "name", recent: "last_fetched", capacity: "capacity" };
  var sortCol = sortCols[sort] || "heat";

  var countRes = db.exec("SELECT COUNT(*) as total FROM worlds " + where, params);
  var total = countRes.length > 0 ? countRes[0].values[0][0] : 0;

  var res = db.exec("SELECT * FROM worlds " + where + " ORDER BY " + sortCol + " DESC LIMIT ? OFFSET ?", params.concat([limit, offset]));
  var worlds = res.length > 0 ? res[0].values.map(function(v) { return rowToObj(res[0].columns, v); }) : [];

  return { worlds: worlds, total: total, page: page, totalPages: Math.ceil(total / limit) };
}

function getWorld(id) {
  var res = db.exec("SELECT * FROM worlds WHERE id = ?", [id]);
  if (res.length === 0 || res[0].values.length === 0) return null;
  return rowToObj(res[0].columns, res[0].values[0]);
}

function getWorldsNeedingCover() {
  var res = db.exec("SELECT id, image_url, thumbnail_url FROM worlds WHERE LENGTH(COALESCE(cover_local,''))=0 AND LENGTH(COALESCE(image_url,''))>0 LIMIT 20");
  if (res.length === 0) return [];
  return res[0].values.map(function(v) { return { id: v[0], image_url: v[1], thumbnail_url: v[2] }; });
}

function updateWorldCover(id, coverLocal, thumbnailLocal) {
  db.run("UPDATE worlds SET cover_local = ?, thumbnail_local = ? WHERE id = ?", [coverLocal, thumbnailLocal, id]);
  saveDb();
}

function upsertInstances(worldId, instances) {
  db.run("DELETE FROM world_instances WHERE world_id = ?", [worldId]);
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    db.run("INSERT OR REPLACE INTO world_instances (id, world_id, name, player_count, capacity, region, type, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [inst.id, worldId, inst.name, inst.player_count, inst.capacity, inst.region, inst.type, inst.created_at]);
  }
  saveDb();
}

function getWorldInstances(worldId) {
  var res = db.exec("SELECT * FROM world_instances WHERE world_id = ? ORDER BY player_count DESC", [worldId]);
  if (res.length === 0) return [];
  return res[0].values.map(function(v) { return rowToObj(res[0].columns, v); });
}

function getStats() {
  var tw = db.exec("SELECT COUNT(*) as c FROM worlds");
  var tp = db.exec("SELECT COALESCE(SUM(player_count), 0) as c FROM world_instances");
  var ti = db.exec("SELECT COUNT(*) as c FROM world_instances");
  return {
    totalWorlds: tw[0] ? tw[0].values[0][0] : 0,
    totalPlayers: tp[0] ? tp[0].values[0][0] : 0,
    totalInstances: ti[0] ? ti[0].values[0][0] : 0,
  };
}

module.exports = { getDb, upsertWorld, getWorlds, getWorld, getWorldsNeedingCover, updateWorldCover, upsertInstances, getWorldInstances, getStats };
