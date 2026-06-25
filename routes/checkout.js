const express = require('express');
const router = express.Router();
const { shopifyGraphQL } = require('../services/shopify');
const { getDayOfWeek, timeToMinutes, SCHEDULE } = require('../config/schedule');
const { getReservationsForDate, getBlockedSlotsForDate } = require('../services/metaobjects');
const { getSettings } = require('../services/settings');

function fmt12(t) {
  const [h, m] = t.split(':').map(Number);
  if (h === 24) return '12:00 AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDateShort(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function overlaps(aS, aE, bS, bE) { return aS < bE && aE > bS; }

// POST /api/checkout
router.post('/', async (req, res) => {
  try {
    const { date, startTime, endTime, durationHours, isFullDay, customerName, customerEmail } = req.body;

    if (!date || !startTime || !endTime || !durationHours || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const dow      = getDayOfWeek(date);
    const schedule = SCHEDULE[dow];
    if (!schedule) return res.status(400).json({ error: 'No availability on that day' });

    // Double-check slot is still available (race condition guard)
    const [reservations, blocked] = await Promise.all([
      getReservationsForDate(date),
      getBlockedSlotsForDate(date),
    ]);
    const slotS = timeToMinutes(startTime);
    const slotE = timeToMinutes(endTime);
    const dayS  = timeToMinutes(schedule.start);
    const dayE  = timeToMinutes(schedule.end);

    const taken = [
      ...reservations.map(r => ({ s: timeToMinutes(r.start_time), e: timeToMinutes(r.end_time) })),
      ...blocked.map(b => b.start_time && b.end_time
        ? { s: timeToMinutes(b.start_time), e: timeToMinutes(b.end_time) }
        : { s: dayS, e: dayE }),
    ];
    if (taken.some(r => overlaps(slotS, slotE, r.s, r.e))) {
      return res.status(409).json({ error: 'That time slot was just booked. Please select another.' });
    }

    const fullDay  = isFullDay === true || isFullDay === 'true';
    const settings = await getSettings();
    const hourlyRate    = parseFloat(settings.hourly_rate)            || 10;
    const weekdayFDP    = parseFloat(settings.weekday_full_day_price) || 30;
    const weekendFDP    = parseFloat(settings.weekend_full_day_price) || 50;
    const fullDayEnabled = settings.full_day_enabled !== 'false';

    if (fullDay && !fullDayEnabled) {
      return res.status(400).json({ error: 'Full day booking is not currently available.' });
    }

    const isWeekend = dow === 0 || dow === 6;
    const price = fullDay ? (isWeekend ? weekendFDP : weekdayFDP) : parseInt(durationHours, 10) * hourlyRate;

    const timeDisplay = fullDay
      ? `Full Day (${fmt12(startTime)} – ${fmt12(endTime)})`
      : `${fmt12(startTime)} – ${fmt12(endTime)}`;

    const data = await shopifyGraphQL(`
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id invoiceUrl }
          userErrors { field message }
        }
      }
    `, {
      input: {
        lineItems: [{
          title: `Secret Lair Lounge – ${fmtDateShort(date)}`,
          quantity: 1,
          originalUnitPrice: price.toFixed(2),
          requiresShipping: false,
          taxable: false,
          customAttributes: [
            { key: 'Date',     value: fmtDateShort(date) },
            { key: 'Time',     value: timeDisplay },
            { key: 'Duration', value: fullDay ? 'Full Day' : `${durationHours} hours` },
          ],
        }],
        email: customerEmail,
        customAttributes: [
          { key: '_reservation_date',  value: date },
          { key: '_start_time',        value: startTime },
          { key: '_end_time',          value: endTime },
          { key: '_duration_hours',    value: String(durationHours) },
          { key: '_is_full_day',       value: fullDay ? 'true' : 'false' },
          { key: '_customer_name',     value: customerName },
          { key: '_customer_email',    value: customerEmail },
          { key: '_total_price',       value: String(price) },
        ],
      },
    });

    const { userErrors, draftOrder } = data.draftOrderCreate;
    if (userErrors.length) return res.status(400).json({ error: userErrors[0].message });

    res.json({ checkoutUrl: draftOrder.invoiceUrl });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

module.exports = router;
