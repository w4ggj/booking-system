const fetch = require('node-fetch');

const API_VERSION = '2024-10';

async function shopifyGraphQL(query, variables = {}) {
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

module.exports = { shopifyGraphQL };
