const express = require('express');
const router = express.Router();
const db = require('../db');
const vrchat = require('../vrchat');
const path = require('path');
const fs = require('fs');

router.get('/worlds', function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 24;
    var search = req.query.search || '';
    var sort = req.query.sort || 'heat';
    var result = db.getWorlds({ page: page, limit: limit, search: search, sort: sort });
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/worlds/:id', function(req, res) {
  try {
    var world = db.getWorld(req.params.id);
    if (!world) return res.status(404).json({ error: 'World not found in database' });
    var instances = db.getWorldInstances(req.params.id);
    res.json(Object.assign({}, world, { instances: instances }));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/worlds/lookup', async function(req, res) {
  try {
    var id = req.body.id;
    if (!id) return res.status(400).json({ error: 'World ID required' });
    var world = await vrchat.fetchWorld(id);
    if (!world) return res.status(404).json({ error: 'World not found on VRChat' });
    db.upsertWorld(world);
    var instances = await vrchat.fetchWorldInstances(id);
    db.upsertInstances(id, instances);
    var saved = db.getWorld(id);
    res.json(Object.assign({}, saved, { instances: db.getWorldInstances(id) }));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/worlds/search', async function(req, res) {
  try {
    var query = req.body.query;
    var n = req.body.n || 20;
    if (!query) return res.status(400).json({ error: 'Query required' });
    var worlds = await vrchat.searchWorlds(query, { n: n });
    for (var i = 0; i < worlds.length; i++) {
      db.upsertWorld(worlds[i]);
    }
    res.json({ count: worlds.length, worlds: worlds.map(function(w) { return w.id; }) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stats', function(req, res) {
  try {
    res.json(db.getStats());
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/covers/fetch', async function(req, res) {
  try {
    var worlds = db.getWorldsNeedingCover();
    var coverDir = path.join(__dirname, '..', 'public', 'covers');
    if (!fs.existsSync(coverDir)) fs.mkdirSync(coverDir, { recursive: true });
    var results = [];
    for (var i = 0; i < worlds.length; i++) {
      var w = worlds[i];
      var coverExt = (w.image_url.split('.').pop() || 'jpg').split('?')[0];
      var thumbExt = (w.thumbnail_url.split('.').pop() || 'jpg').split('?')[0];
      var coverPath = path.join(coverDir, w.id + '_cover.' + coverExt);
      var thumbPath = path.join(coverDir, w.id + '_thumb.' + thumbExt);
      var coverOk = await vrchat.downloadImage(w.image_url, coverPath);
      var thumbOk = await vrchat.downloadImage(w.thumbnail_url, thumbPath);
      if (coverOk || thumbOk) {
        db.updateWorldCover(w.id,
          coverOk ? 'covers/' + w.id + '_cover.' + coverExt : '',
          thumbOk ? 'covers/' + w.id + '_thumb.' + thumbExt : ''
        );
        results.push({ id: w.id, cover: coverOk, thumb: thumbOk });
      }
    }
    res.json({ fetched: results.length, results: results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/worlds/:id/instances', async function(req, res) {
  try {
    var instances = await vrchat.fetchWorldInstances(req.params.id);
    db.upsertInstances(req.params.id, instances);
    res.json({ count: instances.length, instances: instances });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
