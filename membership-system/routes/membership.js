const express = require('express');
const router  = express.Router();

const { getMemberByEmail, getMemberById } = require('../services/members');
const { generateMagicToken, verifyMember } = require('../middleware/auth');
const { sendMagicLinkEmail } = require('../services/email');
const { shopifyGraphQL } = require('../services/shopify');

// POST /api/membership/send-magic-link  { email }
router.post('/send-magic-link', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const member = await getMemberByEmail(email.trim().toLowerCase());
    if (member) {
      const token = generateMagicToken(member.email, member.customerId, member.id);
      await sendMagicLinkEmail({ to: member.email, name: member.name, token });
    }
    // Always respond the same way (don't reveal if email is registered)
    res.json({ sent: true });
  } catch (err) {
    console.error('[membership] send-magic-link error:', err.message);
    res.status(500).json({ error: 'Failed to send login email' });
  }
});

// GET /api/membership/me  (requires Bearer token)
router.get('/me', verifyMember, async (req, res) => {
  try {
    const member = await getMemberById(req.member.memberId);
    if (!member) return res.status(404).json({ error: 'Member record not found' });
    res.json({
      name:            member.name,
      email:           member.email,
      status:          member.status,
      tier:            member.tier,
      startedAt:       member.startedAt,
      nextBillingDate: member.nextBillingDate,
    });
  } catch (err) {
    console.error('[membership] me error:', err.message);
    res.status(500).json({ error: 'Failed to load membership' });
  }
});

// POST /api/membership/cancel  (requires Bearer token)
router.post('/cancel', verifyMember, async (req, res) => {
  try {
    const member = await getMemberById(req.member.memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

    if (member.subscriptionId) {
      const data = await shopifyGraphQL(`
        mutation($id: ID!) {
          subscriptionContractCancel(subscriptionContractId: $id) {
            contract { id status }
            userErrors { field message }
          }
        }
      `, { id: member.subscriptionId });
      const { userErrors } = data.subscriptionContractCancel;
      if (userErrors.length) throw new Error(JSON.stringify(userErrors));
    }

    // The subscription_contracts/update webhook handles the rest (untag, email, etc.)
    res.json({ success: true, message: 'Your membership has been cancelled.' });
  } catch (err) {
    console.error('[membership] cancel error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to cancel' });
  }
});

module.exports = router;
