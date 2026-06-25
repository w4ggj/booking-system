const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const fetch   = require('node-fetch');

const SCOPES = 'read_metaobjects,write_metaobjects,write_metaobject_definitions,read_draft_orders,write_draft_orders,read_orders';

// GET /auth  — start the OAuth install
router.get('/', (req, res) => {
  const shop        = process.env.SHOPIFY_SHOP;
  const clientId    = process.env.SHOPIFY_CLIENT_ID;
  const redirectUri = `${process.env.BASE_URL}/auth/callback`;
  const state       = crypto.randomBytes(16).toString('hex');

  const url = `https://${shop}/admin/oauth/authorize`
    + `?client_id=${clientId}`
    + `&scope=${SCOPES}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${state}`;

  res.redirect(url);
});

// GET /auth/callback  — Shopify redirects here after the merchant approves
router.get('/callback', async (req, res) => {
  const { code, shop, hmac } = req.query;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  // Verify HMAC to confirm the request is genuinely from Shopify
  const params = Object.entries(req.query)
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const computed = crypto.createHmac('sha256', clientSecret).update(params).digest('hex');
  if (computed !== hmac) return res.status(400).send('HMAC validation failed.');

  try {
    // Exchange the code for a permanent access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        client_id:     process.env.SHOPIFY_CLIENT_ID,
        client_secret: clientSecret,
        code,
      }),
    });

    const { access_token, error_description } = await tokenRes.json();
    if (!access_token) return res.status(400).send(`Token exchange failed: ${error_description}`);

    // Show the token so you can copy it into Render env vars
    res.send(`<!DOCTYPE html>
<html>
<head><title>Balance Booking – Install Complete</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#e0e0e8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#1a1a2e;border:1px solid #2a2a42;border-radius:12px;padding:40px;max-width:600px;width:100%}
  h2{color:#22c55e;margin:0 0 8px}
  p{color:#aaa;margin:8px 0}
  .token{background:#0a0a14;border:1px solid #e94560;border-radius:8px;padding:16px;font-family:monospace;font-size:13px;word-break:break-all;color:#e94560;margin:16px 0}
  .step{background:#12121e;border-radius:8px;padding:14px 18px;margin:10px 0;font-size:14px}
  strong{color:#fff}
</style>
</head>
<body>
<div class="card">
  <h2>✅ App Installed Successfully</h2>
  <p>Copy the access token below and add it to your Render environment variables.</p>

  <div class="token">${access_token}</div>

  <div class="step">1. Go to your <strong>Render dashboard → balance-booking → Environment</strong></div>
  <div class="step">2. Add a new variable: <strong>SHOPIFY_ACCESS_TOKEN</strong> = the token above</div>
  <div class="step">3. Click <strong>Save Changes</strong> — Render will redeploy automatically</div>
  <div class="step">4. Once redeployed, run <strong>node setup/initShopify.js</strong> to finish setup</div>

  <p style="margin-top:20px;color:#555;font-size:12px;">⚠️ This token will not be shown again from this page. Save it now.</p>
</div>
</body>
</html>`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('OAuth error — check server logs.');
  }
});

module.exports = router;
