const express = require('express');
const router = express.Router();
const { generateToken, verifyToken } = require('../middleware/auth');
const {
  getAllReservations, cancelReservation,
  getAllBlockedSlots, createBlockedSlot, deleteMetaobject,
} = require('../services/metaobjects');
const { sendAdminMessage } = require('../services/email');
const { getSettings, updateSettings } = require('../services/settings');

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ token: generateToken() });
});

// GET /api/admin/reservations?all=true
router.get('/reservations', verifyToken, async (req, res) => {
  try {
    const reservations = await getAllReservations({ includeAll: req.query.all === 'true' });
    res.json({ reservations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

// PUT /api/admin/reservations/cancel  { id }
router.put('/reservations/cancel', verifyToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    await cancelReservation(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel reservation' });
  }
});

// GET /api/admin/blocked
router.get('/blocked', verifyToken, async (req, res) => {
  try {
    const slots = await getAllBlockedSlots();
    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch blocked slots' });
  }
});

// POST /api/admin/blocked  { date, startTime?, endTime?, reason? }
router.post('/blocked', verifyToken, async (req, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    const result = await createBlockedSlot({ date, startTime, endTime, reason });
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to block slot' });
  }
});

// DELETE /api/admin/blocked  { id }
router.delete('/blocked', verifyToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    await deleteMetaobject(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete blocked slot' });
  }
});

// POST /api/admin/message  { customerEmail, customerName, subject, message }
router.post('/message', verifyToken, async (req, res) => {
  try {
    const { customerEmail, customerName, subject, message } = req.body;
    if (!customerEmail || !subject || !message) {
      return res.status(400).json({ error: 'customerEmail, subject, and message are required' });
    }
    await sendAdminMessage({ customerEmail, customerName: customerName || 'Customer', subject, message });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/admin/settings
router.get('/settings', verifyToken, async (req, res) => {
  try {
    const s = await getSettings();
    res.json({
      hourlyRate:          parseFloat(s.hourly_rate)            || 10,
      weekdayFullDayPrice: parseFloat(s.weekday_full_day_price) || 30,
      weekendFullDayPrice: parseFloat(s.weekend_full_day_price) || 50,
      fullDayEnabled:      s.full_day_enabled !== 'false',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/admin/settings
router.put('/settings', verifyToken, async (req, res) => {
  try {
    const { hourlyRate, weekdayFullDayPrice, weekendFullDayPrice, fullDayEnabled } = req.body;
    await updateSettings({
      hourly_rate:              String(hourlyRate),
      weekday_full_day_price:   String(weekdayFullDayPrice),
      weekend_full_day_price:   String(weekendFullDayPrice),
      full_day_enabled:         fullDayEnabled ? 'true' : 'false',
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
