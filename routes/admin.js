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

// POST /api/admin/blocked  { date, startTime?, endTime?, reason?, repeat?, repeatUntil? }
router.post('/blocked', verifyToken, async (req, res) => {
  try {
    const { date, startTime, endTime, reason, repeat, repeatUntil } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    if (repeat && repeatUntil) {
      const step = repeat === 'weekly' ? 7 : 1;
      const dates = [];
      const [y, m, d] = date.split('-').map(Number);
      let cur = new Date(y, m - 1, d);
      const [uy, um, ud] = repeatUntil.split('-').map(Number);
      const until = new Date(uy, um - 1, ud);
      while (cur <= until) {
        const yy = cur.getFullYear();
        const mm = String(cur.getMonth() + 1).padStart(2, '0');
        const dd = String(cur.getDate()).padStart(2, '0');
        dates.push(`${yy}-${mm}-${dd}`);
        cur.setDate(cur.getDate() + step);
      }
      const results = await Promise.all(
        dates.map(dt => createBlockedSlot({ date: dt, startTime, endTime, reason }))
      );
      return res.json({ success: true, count: results.length });
    }

    const result = await createBlockedSlot({ date, startTime, endTime, reason });
    res.json({ success: true, id: result.id, count: 1 });
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
    console.error('updateSettings error:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

module.exports = router;
