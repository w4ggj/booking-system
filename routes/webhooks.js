const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createReservation, reservationExistsForOrder } = require('../services/metaobjects');
const { sendConfirmationEmail } = require('../services/email');

function verifyShopifyHmac(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// POST /api/webhooks/orders-paid
// Shopify fires this when a draft-order invoice is paid
router.post('/orders-paid', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] || '';
  if (!verifyShopifyHmac(req.rawBody, hmac)) {
    return res.status(401).send('Unauthorized');
  }

  // Respond 200 immediately so Shopify doesn't retry
  res.status(200).send('OK');

  try {
    const order = req.body;

    // Extract our hidden attributes from note_attributes
    const attrs = {};
    (order.note_attributes || []).forEach(a => { attrs[a.name] = a.value; });

    if (!attrs._reservation_date) return; // not a room reservation order

    // Idempotency guard — don't create duplicate records on retried webhooks
    const already = await reservationExistsForOrder(String(order.id));
    if (already) {
      console.log(`Order ${order.id} already has a reservation, skipping`);
      return;
    }

    const {
      _reservation_date, _start_time, _end_time,
      _duration_hours, _is_full_day,
      _customer_name, _customer_email, _total_price,
    } = attrs;

    await createReservation({
      date:          _reservation_date,
      startTime:     _start_time,
      endTime:       _end_time,
      durationHours: parseInt(_duration_hours, 10),
      isFullDay:     _is_full_day === 'true',
      customerName:  _customer_name,
      customerEmail: _customer_email,
      orderId:       String(order.id),
      orderNumber:   String(order.order_number),
      totalPrice:    parseFloat(_total_price),
    });

    await sendConfirmationEmail({
      customerEmail: _customer_email,
      customerName:  _customer_name,
      date:          _reservation_date,
      startTime:     _start_time,
      endTime:       _end_time,
      durationHours: parseInt(_duration_hours, 10),
      isFullDay:     _is_full_day,
      totalPrice:    _total_price,
      orderNumber:   String(order.order_number),
    });

    console.log(`✅ Reservation created: ${_reservation_date} ${_start_time}–${_end_time} for ${_customer_name}`);
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

module.exports = router;
