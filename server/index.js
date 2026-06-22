const express = require('express');
const path = require('path');
const { getDb } = require('./db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRoutes);

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async function() {
  await getDb();
  console.log('Database initialized');
  app.listen(PORT, function() {
    console.log('vrcmaps server running on http://localhost:' + PORT);
    console.log('API: http://localhost:' + PORT + '/api');
  });
})();
