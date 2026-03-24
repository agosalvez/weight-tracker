const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/logs',     require('./routes/api/logs'));
app.use('/api/settings', require('./routes/api/settings'));
app.use('/api/stats',    require('./routes/api/stats'));

// Page routes
const pages = path.join(__dirname, 'public', 'pages');
app.get('/',         (req, res) => res.sendFile(path.join(pages, 'home.html')));
app.get('/history',  (req, res) => res.sendFile(path.join(pages, 'history.html')));
app.get('/stats',    (req, res) => res.sendFile(path.join(pages, 'stats.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(pages, 'settings.html')));

app.listen(PORT, () => {
  console.log(`\n  Weight Tracker → http://localhost:${PORT}\n`);
});
