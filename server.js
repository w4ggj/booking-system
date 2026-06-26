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

// Inject checkout URL into portal — builds direct cart link with selling plan pre-selected
app.get('/portal-config.js', (_req, res) => {
  res.type('application/javascript');
  const shop      = process.env.SHOPIFY_SHOP || '';
  const variantId = (process.env.MEMBERSHIP_VARIANT_ID || '').replace('gid://shopify/ProductVariant/', '');
  const planId    = (process.env.SELLING_PLAN_ID || '').replace('gid://shopify/SellingPlan/', '');
  const url = (shop && variantId && planId)
    ? `https://${shop}/cart/${variantId}:1?selling_plan=${planId}`
    : (process.env.MEMBERSHIP_PRODUCT_URL || '#');
  res.send(`window.MEMBERSHIP_PRODUCT_URL = "${url}";`);
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
