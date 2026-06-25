require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { shopifyGraphQL } = require('../services/shopify');

async function ensureMemberDefinition() {
  const data = await shopifyGraphQL(`
    mutation($def: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $def) {
        metaobjectDefinition { id }
        userErrors { field message }
      }
    }
  `, {
    def: {
      type: 'membership_member',
      name: 'Membership Member',
      fieldDefinitions: [
        { key: 'customer_id',              name: 'Customer ID',              type: 'single_line_text_field', required: true  },
        { key: 'customer_email',           name: 'Customer Email',           type: 'single_line_text_field', required: true  },
        { key: 'customer_name',            name: 'Customer Name',            type: 'single_line_text_field', required: false },
        { key: 'subscription_contract_id', name: 'Subscription Contract ID', type: 'single_line_text_field', required: false },
        { key: 'status',                   name: 'Status',                   type: 'single_line_text_field', required: true  },
        { key: 'tier',                     name: 'Tier',                     type: 'single_line_text_field', required: false },
        { key: 'started_at',               name: 'Started At',               type: 'single_line_text_field', required: false },
        { key: 'next_billing_date',        name: 'Next Billing Date',        type: 'single_line_text_field', required: false },
      ],
    },
  });
  const { userErrors } = data.metaobjectDefinitionCreate;
  if (userErrors.length) {
    if (userErrors.some(e => /taken|already exists/i.test(e.message))) {
      console.log('[setup] membership_member definition already exists');
      return;
    }
    throw new Error(JSON.stringify(userErrors));
  }
  console.log('[setup] membership_member definition created:', data.metaobjectDefinitionCreate.metaobjectDefinition.id);
}

async function createMembershipProduct() {
  console.log('\nCreating Elite Membership product...');

  const prodData = await shopifyGraphQL(`
    mutation($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product { id variants(first: 1) { nodes { id } } }
        userErrors { field message }
      }
    }
  `, {
    product: {
      title:       'Elite Membership',
      productType: 'Membership',
      vendor:      'Balance Gaming FL',
      status:      'ACTIVE',
      requiresSellingPlan: true,
      variants: [{ price: '10.00', requiresShipping: false }],
    },
  });
  const { product, userErrors: prodErrors } = prodData.productCreate;
  if (prodErrors.length) throw new Error(JSON.stringify(prodErrors));

  const productId = product.id;
  const variantId = product.variants.nodes[0].id;
  console.log('  ✅ Product:', productId);
  console.log('  ✅ Variant:', variantId);

  // Selling plan: $15 first cycle, then $10/month
  const planData = await shopifyGraphQL(`
    mutation($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput!) {
      sellingPlanGroupCreate(input: $input, resources: $resources) {
        sellingPlanGroup {
          id
          sellingPlans(first: 1) { nodes { id name } }
        }
        userErrors { field message }
      }
    }
  `, {
    input: {
      name:         'Elite Membership',
      merchantCode: 'elite-membership',
      options:      ['Membership'],
      sellingPlans: [{
        name:     'Monthly',
        options:  ['Monthly'],
        category: 'SUBSCRIPTION',
        billingPolicy: {
          recurring: { interval: 'MONTH', intervalCount: 1, minCycles: null, maxCycles: null },
        },
        deliveryPolicy: {
          recurring: {
            interval: 'MONTH', intervalCount: 1,
            preAnchorBehavior: 'ASAP', anchors: [], intent: 'FULFILLMENT_BEGIN',
          },
        },
        pricingPolicies: [
          {
            // First billing cycle: $15 (initiation fee)
            fixed: { adjustmentType: 'PRICE', adjustmentValue: { fixedValue: '15.00' } },
          },
          {
            // All subsequent monthly cycles: $10
            recurring: { adjustmentType: 'PRICE', adjustmentValue: { fixedValue: '10.00' }, recurringCycles: 0 },
          },
        ],
      }],
    },
    resources: { productVariantIds: [variantId] },
  });

  const { sellingPlanGroup, userErrors: planErrors } = planData.sellingPlanGroupCreate;
  if (planErrors.length) throw new Error(JSON.stringify(planErrors));
  const sellingPlanId = sellingPlanGroup.sellingPlans.nodes[0].id;
  console.log('  ✅ Selling plan group:', sellingPlanGroup.id);
  console.log('  ✅ Selling plan:', sellingPlanId);

  console.log('\n⚠️  Add these to your Render environment variables:');
  console.log(`   MEMBERSHIP_PRODUCT_ID=${productId}`);
  console.log(`   MEMBERSHIP_VARIANT_ID=${variantId}`);
  console.log(`   SELLING_PLAN_ID=${sellingPlanId}`);
  console.log(`   MEMBERSHIP_PRODUCT_URL=https://${process.env.SHOPIFY_SHOP}/products/elite-membership`);

  return { productId, variantId, sellingPlanId };
}

async function registerWebhooks() {
  const base  = process.env.BASE_URL || 'https://balance-membership.onrender.com';
  const hooks = [
    { topic: 'SUBSCRIPTION_CONTRACTS_CREATE',         path: '/api/webhooks/subscription-contracts-create' },
    { topic: 'SUBSCRIPTION_CONTRACTS_UPDATE',         path: '/api/webhooks/subscription-contracts-update' },
    { topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS', path: '/api/webhooks/billing-attempts-success'      },
    { topic: 'ORDERS_PAID',                           path: '/api/webhooks/orders-paid'                   },
  ];

  for (const { topic, path } of hooks) {
    const address  = base + path;
    const existing = await shopifyGraphQL(`
      query($topic: WebhookSubscriptionTopic!) {
        webhookSubscriptions(first: 10, topics: [$topic]) { nodes { callbackUrl } }
      }
    `, { topic });
    if (existing.webhookSubscriptions.nodes.some(w => w.callbackUrl === address)) {
      console.log(`  ↳ ${topic} already registered`);
      continue;
    }
    const data = await shopifyGraphQL(`
      mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          webhookSubscription { id }
          userErrors { field message }
        }
      }
    `, { topic, sub: { callbackUrl: address, format: 'JSON' } });
    const { userErrors } = data.webhookSubscriptionCreate;
    if (userErrors.length) throw new Error(JSON.stringify(userErrors));
    console.log(`  ✅ ${topic}`);
  }
}

async function main() {
  console.log('\n🚀 Balance Membership — Shopify Setup\n');
  console.log('1. Metaobject definition...');
  await ensureMemberDefinition();
  console.log('\n2. Membership product + selling plan...');
  await createMembershipProduct();
  console.log('\n3. Webhooks...');
  await registerWebhooks();
  console.log('\n✨ Setup complete!\n');
}

if (require.main === module) {
  main().catch(err => { console.error('Setup failed:', err.message); process.exit(1); });
}

module.exports = { ensureMemberDefinition };
