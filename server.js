require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth',             require('./routes/auth'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/checkout',     require('./routes/checkout'));
app.use('/api/webhooks',     require('./routes/webhooks'));
app.use('/api/admin',        require('./routes/admin'));

// SPA fallback: /admin/* → admin panel, everything else → booking form
app.get('/admin*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Balance Booking running on port ${PORT}`));
