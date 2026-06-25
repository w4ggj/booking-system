const express = require('express');
const router  = express.Router();

const { generateAdminToken, verifyAdmin } = require('../middleware/auth');
const {
  getAllMembers, getMemberById, updateMember, deleteMember,
  tagCustomer, untagCustomer,
} = require('../services/members');
const { shopifyGraphQL } = require('../services/shopify');

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ token: generateAdminToken() });
});

// GET /api/admin/members
router.get('/members', verifyAdmin, async (req, res) => {
  try {
    const members = await getAllMembers();
    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// PUT /api/admin/members/:id/status  { status }
router.put('/members/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active','cancelled','paused'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const member = await getMemberById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await updateMember(member.id, { status });

    // Sync customer tag
    if (member.customerId) {
      if (status === 'active')    await tagCustomer(member.customerId, 'elite-member');
      if (status === 'cancelled') await untagCustomer(member.customerId, 'elite-member');
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to update status' });
  }
});

// POST /api/admin/members/:id/cancel-subscription
router.post('/members/:id/cancel-subscription', verifyAdmin, async (req, res) => {
  try {
    const member = await getMemberById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (!member.subscriptionId) return res.status(400).json({ error: 'No subscription ID on record' });

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

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to cancel subscription' });
  }
});

// DELETE /api/admin/members/:id  (removes record only, does not cancel subscription)
router.delete('/members/:id', verifyAdmin, async (req, res) => {
  try {
    await deleteMember(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete member record' });
  }
});

module.exports = router;
