require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { shopifyGraphQL } = require('../services/shopify');

async function ensureMetaobjectDefinition(type, name, fieldDefinitions) {
  const mutation = `
    mutation CreateDef($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { type }
        userErrors { field message }
      }
    }`;
  const data = await shopifyGraphQL(mutation, { definition: { type, name, fieldDefinitions } });
  const { userErrors } = data.metaobjectDefinitionCreate;
  if (userErrors.length) {
    if (userErrors.some(e => e.message.toLowerCase().includes('already exists') || e.message.toLowerCase().includes('taken'))) {
      console.log(`  ↳ "${type}" already exists — skipping`);
      return;
    }
    throw new Error(JSON.stringify(userErrors));
  }
  console.log(`  ✅ Created metaobject definition: ${type}`);
}

async function registerWebhook(topic, address) {
  // Check if already registered
  const listData = await shopifyGraphQL(`
    query { webhookSubscriptions(first: 50, topics: [${topic}]) {
      nodes { id callbackUrl }
    }}`);
  const existing = listData.webhookSubscriptions.nodes.find(w => w.callbackUrl === address);
  if (existing) {
    console.log(`  ↳ Webhook for ${topic} already registered — skipping`);
    return;
  }

  const data = await shopifyGraphQL(`
    mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
        webhookSubscription { id }
        userErrors { field message }
      }
    }`, {
    topic,
    subscription: { callbackUrl: address, format: 'JSON' },
  });

  const { userErrors } = data.webhookSubscriptionCreate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  console.log(`  ✅ Registered webhook: ${topic} → ${address}`);
}

async function ensureSettingsInstance() {
  const data = await shopifyGraphQL(
    `query { metaobjects(type: "booking_config", first: 1) { nodes { id } } }`
  );
  if (data.metaobjects.nodes.length > 0) {
    console.log('  ↳ booking_config instance already exists — skipping');
    return;
  }
  const create = await shopifyGraphQL(`
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
  const { userErrors } = create.metaobjectCreate;
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  console.log(`  ✅ Created booking_config instance with default values`);
}

async function main() {
  console.log('\n🚀 Setting up Shopify metaobjects and webhooks...\n');

  console.log('Creating metaobject definitions:');
  await ensureMetaobjectDefinition('reservation', 'Reservation', [
    { key: 'date',           name: 'Date',           type: 'date',                    required: true  },
    { key: 'start_time',     name: 'Start Time',     type: 'single_line_text_field',  required: true  },
    { key: 'end_time',       name: 'End Time',       type: 'single_line_text_field',  required: true  },
    { key: 'duration_hours', name: 'Duration Hours', type: 'number_integer',          required: true  },
    { key: 'is_full_day',    name: 'Is Full Day',    type: 'single_line_text_field',  required: false },
    { key: 'customer_name',  name: 'Customer Name',  type: 'single_line_text_field',  required: true  },
    { key: 'customer_email', name: 'Customer Email', type: 'single_line_text_field',  required: true  },
    { key: 'order_id',       name: 'Order ID',       type: 'single_line_text_field',  required: false },
    { key: 'order_number',   name: 'Order Number',   type: 'single_line_text_field',  required: false },
    { key: 'status',         name: 'Status',         type: 'single_line_text_field',  required: true  },
    { key: 'total_price',    name: 'Total Price',    type: 'number_decimal',          required: false },
    { key: 'notes',          name: 'Notes',          type: 'multi_line_text_field',   required: false },
  ]);

  await ensureMetaobjectDefinition('blocked_slot', 'Blocked Slot', [
    { key: 'date',       name: 'Date',       type: 'date',                   required: true  },
    { key: 'start_time', name: 'Start Time', type: 'single_line_text_field', required: false },
    { key: 'end_time',   name: 'End Time',   type: 'single_line_text_field', required: false },
    { key: 'reason',     name: 'Reason',     type: 'single_line_text_field', required: false },
  ]);

  await ensureMetaobjectDefinition('booking_config', 'Booking Config', [
    { key: 'hourly_rate',            name: 'Hourly Rate',            type: 'single_line_text_field', required: true },
    { key: 'weekday_full_day_price', name: 'Weekday Full Day Price', type: 'single_line_text_field', required: true },
    { key: 'weekend_full_day_price', name: 'Weekend Full Day Price', type: 'single_line_text_field', required: true },
    { key: 'full_day_enabled',       name: 'Full Day Enabled',       type: 'single_line_text_field', required: true },
  ]);
  await ensureSettingsInstance();

  console.log('\nRegistering webhooks:');
  const baseUrl = process.env.BASE_URL || 'https://balance-booking.onrender.com';
  await registerWebhook('ORDERS_PAID', `${baseUrl}/api/webhooks/orders-paid`);

  console.log('\n✨ Setup complete!\n');
}

main().catch(err => { console.error('Setup failed:', err); process.exit(1); });
