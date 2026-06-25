const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const {
  getMemberBySubscriptionId, createMember, updateMember,
  tagCustomer, untagCustomer, getCustomer,
} = require('../services/members');
const { sendWelcomeEmail, sendCancellationEmail, sendRenewalEmail } = require('../services/email');
const { shopifyGraphQL } = require('../services/shopify');

function verifyHmac(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  const hmac   = req.headers['x-shopify-hmac-sha256'];
  if (!hmac)   return false;
  const digest = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

function guard(req, res) {
  if (!verifyHmac(req)) { res.status(401).send('Unauthorized'); return false; }
  return true;
}

// ── subscription_contracts/create ──────────────────────────────────────────
router.post('/subscription-contracts-create', async (req, res) => {
  if (!guard(req, res)) return;
  res.sendStatus(200);

  const contract    = req.body;
  const contractGid = contract.admin_graphql_api_id;
  const customerId  = `gid://shopify/Customer/${contract.customer_id}`;

  try {
    const existing = await getMemberBySubscriptionId(contractGid);
    if (existing) { console.log('[webhook] already processed:', contractGid); return; }

    const customer = await getCustomer(customerId);
    if (!customer) { console.error('[webhook] customer not found:', customerId); return; }

    const name  = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    const email = customer.email;

    const nextBilling = new Date();
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    await createMember({ customerId, email, name, subscriptionId: contractGid });
    await tagCustomer(customerId, 'elite-member');
    await sendWelcomeEmail({ to: email, name, nextBillingDate: nextBilling });

    console.log(`[webhook] new member: ${email}`);
  } catch (err) {
    console.error('[webhook] subscription-contracts-create error:', err.message);
  }
});

// ── subscription_contracts/update ──────────────────────────────────────────
router.post('/subscription-contracts-update', async (req, res) => {
  if (!guard(req, res)) return;
  res.sendStatus(200);

  const contract    = req.body;
  const contractGid = contract.admin_graphql_api_id;
  const newStatus   = (contract.status || '').toUpperCase();

  if (newStatus !== 'CANCELLED' && newStatus !== 'PAUSED') return;

  try {
    const member = await getMemberBySubscriptionId(contractGid);
    if (!member) { console.warn('[webhook] contract not in records:', contractGid); return; }

    const status = newStatus === 'CANCELLED' ? 'cancelled' : 'paused';
    await updateMember(member.id, { status });

    if (newStatus === 'CANCELLED') {
      if (member.customerId) await untagCustomer(member.customerId, 'elite-member');
      if (member.email) await sendCancellationEmail({ to: member.email, name: member.name });
      console.log(`[webhook] cancelled member: ${member.email}`);
    }
  } catch (err) {
    console.error('[webhook] subscription-contracts-update error:', err.message);
  }
});

// ── subscription_billing_attempts/success ──────────────────────────────────
router.post('/billing-attempts-success', async (req, res) => {
  if (!guard(req, res)) return;
  res.sendStatus(200);

  const attempt     = req.body;
  const contractGid = attempt.subscription_contract_id
    ? `gid://shopify/SubscriptionContract/${attempt.subscription_contract_id}`
    : null;
  if (!contractGid) return;

  try {
    const member = await getMemberBySubscriptionId(contractGid);
    if (!member) return;

    const nextBilling = new Date();
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    await updateMember(member.id, { status: 'active', next_billing_date: nextBilling.toISOString() });
    if (member.customerId) await tagCustomer(member.customerId, 'elite-member');
    if (member.email) await sendRenewalEmail({ to: member.email, name: member.name, nextBillingDate: nextBilling });

    console.log(`[webhook] renewed member: ${member.email}`);
  } catch (err) {
    console.error('[webhook] billing-attempts-success error:', err.message);
  }
});

// ── orders/paid — tag membership orders ────────────────────────────────────
router.post('/orders-paid', async (req, res) => {
  if (!guard(req, res)) return;
  res.sendStatus(200);

  const order         = req.body;
  const memberVariant = process.env.MEMBERSHIP_VARIANT_ID;
  if (!memberVariant) return;

  const variantNumericId = memberVariant.replace('gid://shopify/ProductVariant/', '');
  const hasMembership    = (order.line_items || []).some(li => String(li.variant_id) === variantNumericId);
  if (!hasMembership) return;

  try {
    const orderId = `gid://shopify/Order/${order.id}`;
    await shopifyGraphQL(`
      mutation($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
      }
    `, { id: orderId, tags: ['membership-order'] });
    console.log(`[webhook] tagged order ${order.order_number} as membership-order`);
  } catch (err) {
    console.error('[webhook] orders-paid error:', err.message);
  }
});

module.exports = router;
