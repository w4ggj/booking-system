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

app.get('/api/settings', async (_req, res) => {
  try {
    const { getSettings } = require('./services/settings');
    const s = await getSettings();
    res.json({
      hourlyRate:           parseFloat(s.hourly_rate)             || 10,
      weekdayFullDayPrice:  parseFloat(s.weekday_full_day_price)  || 30,
      weekendFullDayPrice:  parseFloat(s.weekend_full_day_price)  || 50,
      fullDayEnabled:       s.full_day_enabled !== 'false',
    });
  } catch {
    res.json({ hourlyRate: 10, weekdayFullDayPrice: 30, weekendFullDayPrice: 50, fullDayEnabled: true });
  }
});

// Temporary debug: check server's Shopify access
app.get('/api/debug/settings', async (_req, res) => {
  const { shopifyGraphQL } = require('./services/shopify');
  const KNOWN_ID = 'gid://shopify/Metaobject/207702261863';
  const out = { shop: process.env.SHOPIFY_SHOP };

  try {
    const d1 = await shopifyGraphQL(
      `query { metaobjects(type: "booking_config", first: 1) { nodes { id fields { key value } } } }`
    );
    out.byType = d1.metaobjects.nodes;
  } catch (e) { out.byTypeError = e.message; }

  try {
    const d2 = await shopifyGraphQL(
      `query($id:ID!){ node(id:$id){ ... on Metaobject { id fields { key value } } } }`,
      { id: KNOWN_ID }
    );
    out.byId = d2.node;
  } catch (e) { out.byIdError = e.message; }

  res.json(out);
});

// SPA fallback: /admin/* → admin panel, everything else → booking form
app.get('/admin*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Balance Booking running on port ${PORT}`);
  try {
    const { ensureBookingConfig } = require('./services/settings');
    ensureBookingConfig().catch(err => console.error('[settings] startup error:', err.message));
  } catch (err) {
    console.error('[settings] startup error:', err.message);
  }
});
