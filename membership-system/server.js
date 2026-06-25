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

app.use('/api/webhooks',   require('./routes/webhooks'));
app.use('/api/membership', require('./routes/membership'));
app.use('/api/admin',      require('./routes/admin'));

// Inject the Shopify product URL into the portal page so it can be set from env
app.get('/portal-config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(`window.MEMBERSHIP_PRODUCT_URL = "${process.env.MEMBERSHIP_PRODUCT_URL || '#'}";`);
});

app.get('/admin*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Balance Membership running on port ${PORT}`);
  try {
    const { ensureMemberDefinition } = require('./setup/initShopify');
    ensureMemberDefinition().catch(err =>
      console.error('[setup] startup error:', err.message)
    );
  } catch (err) {
    console.error('[setup] startup error:', err.message);
  }
});
