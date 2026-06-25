const { shopifyGraphQL } = require('./shopify');

const DEFAULTS = {
  hourly_rate: '10',
  weekday_full_day_price: '30',
  weekend_full_day_price: '50',
  full_day_enabled: 'true',
};

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getSettings() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

  try {
    const data = await shopifyGraphQL(`
      query { metaobjects(type: "booking_config", first: 1) { nodes { id fields { key value } } } }
    `);
    const nodes = data.metaobjects.nodes;
    if (!nodes.length) {
      _cache = { ...DEFAULTS };
    } else {
      const fields = nodes[0].fields.reduce((acc, f) => { acc[f.key] = f.value; return acc; }, {});
      _cache = { id: nodes[0].id, ...DEFAULTS, ...fields };
    }
  } catch {
    _cache = { ...DEFAULTS };
  }

  _cacheTime = Date.now();
  return _cache;
}

async function updateSettings(updates) {
  // If cache has no id (cold-start failure), force a fresh fetch to get it
  if (!_cache || !_cache.id) {
    _cache = null;
    _cacheTime = 0;
    await getSettings();
  }

  const id = _cache && _cache.id;
  if (!id) {
    throw new Error('booking_config metaobject not found in Shopify — re-run setup');
  }

  const KEYS = ['hourly_rate', 'weekday_full_day_price', 'weekend_full_day_price', 'full_day_enabled'];
  const merged = { ...DEFAULTS, ...(_cache || {}), ...updates };
  const fields = KEYS.map(k => ({ key: k, value: String(merged[k]) }));

  const data = await shopifyGraphQL(`
    mutation UpdateSettings($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }
  `, { id, metaobject: { fields } });

  const { userErrors } = data.metaobjectUpdate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));

  // Refresh cache with saved values so next read is instant
  _cache = { id, ...merged };
  _cacheTime = Date.now();
}

module.exports = { getSettings, updateSettings };
