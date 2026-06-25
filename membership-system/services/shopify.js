const SHOP    = process.env.SHOPIFY_SHOP;
const TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = '2024-10';

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

module.exports = { shopifyGraphQL };
