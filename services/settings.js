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
      console.warn('getSettings: query succeeded but 0 booking_config nodes returned');
      _cache = { ...DEFAULTS };
    } else {
      const fields = nodes[0].fields.reduce((acc, f) => { acc[f.key] = f.value; return acc; }, {});
      _cache = { id: nodes[0].id, ...DEFAULTS, ...fields };
    }
  } catch (err) {
    console.error('getSettings Shopify error:', err.message);
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

async function ensureBookingConfig() {
  const { shopifyGraphQL } = require('./shopify');

  // Already readable — nothing to do
  _cache = null; _cacheTime = 0;
  const current = await getSettings();
  if (current.id) {
    console.log('[settings] booking_config ready:', current.id);
    return;
  }

  console.log('[settings] booking_config not found — creating definition…');
  try {
    const defData = await shopifyGraphQL(`
      mutation($def: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $def) {
          metaobjectDefinition { id }
          userErrors { field message }
        }
      }`, {
      def: {
        type: 'booking_config',
        name: 'Booking Config',
        fieldDefinitions: [
          { key: 'hourly_rate',            name: 'Hourly Rate',            type: 'single_line_text_field', required: true },
          { key: 'weekday_full_day_price', name: 'Weekday Full Day Price', type: 'single_line_text_field', required: true },
          { key: 'weekend_full_day_price', name: 'Weekend Full Day Price', type: 'single_line_text_field', required: true },
          { key: 'full_day_enabled',       name: 'Full Day Enabled',       type: 'single_line_text_field', required: true },
        ],
      },
    });
    const { userErrors } = defData.metaobjectDefinitionCreate;
    if (userErrors.length) {
      const taken = userErrors.some(e => /taken|already exists/i.test(e.message));
      console.log(taken ? '[settings] definition already exists' : '[settings] definition error:', userErrors);
      if (!taken) return;
    } else {
      console.log('[settings] definition created:', defData.metaobjectDefinitionCreate.metaobjectDefinition.id);
    }
  } catch (err) {
    console.error('[settings] definition creation failed:', err.message);
    return;
  }

  console.log('[settings] creating booking_config instance…');
  try {
    const inst = await shopifyGraphQL(`
      mutation($m: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $m) {
          metaobject { id }
          userErrors { field message }
        }
      }`, {
      m: {
        type: 'booking_config',
        fields: [
          { key: 'hourly_rate',            value: '10'   },
          { key: 'weekday_full_day_price', value: '30'   },
          { key: 'weekend_full_day_price', value: '50'   },
          { key: 'full_day_enabled',       value: 'true' },
        ],
      },
    });
    const { userErrors, metaobject } = inst.metaobjectCreate;
    if (userErrors.length) {
      console.error('[settings] instance creation errors:', userErrors);
    } else {
      console.log('[settings] instance created:', metaobject.id);
      _cache = null; _cacheTime = 0;
    }
  } catch (err) {
    console.error('[settings] instance creation failed:', err.message);
  }
}

module.exports = { getSettings, updateSettings, ensureBookingConfig };
