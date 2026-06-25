const nodemailer = require('nodemailer');

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

function fmt12(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDateLong(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function sendConfirmationEmail({ customerEmail, customerName, date, startTime, endTime, durationHours, isFullDay, totalPrice, orderNumber }) {
  const fullDay = isFullDay === true || isFullDay === 'true';
  const timeDisplay = fullDay ? 'Full Day' : `${fmt12(startTime)} – ${fmt12(endTime)}`;
  const durationDisplay = fullDay ? 'Full Day' : `${durationHours} hour${durationHours > 1 ? 's' : ''}`;

  const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f1a;color:#e0e0e8;padding:32px;border-radius:12px;">
  <div style="text-align:center;margin-bottom:28px;">
    <h1 style="color:#e94560;margin:0;font-size:24px;letter-spacing:1px;">BALANCE GAMING FL</h1>
    <p style="color:#888;margin:4px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Secret Lair Lounge</p>
  </div>

  <div style="background:#1a1a2e;border-left:4px solid #e94560;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
    <h2 style="color:#e94560;margin:0 0 8px;font-size:18px;">✅ Reservation Confirmed</h2>
    <p style="margin:0;color:#bbb;">Hi ${customerName}, your booking is confirmed and paid.</p>
  </div>

  <div style="background:#1a1a2e;border-radius:8px;padding:24px;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #2a2a3e;width:40%;">Date</td>
          <td style="padding:10px 0;font-weight:600;border-bottom:1px solid #2a2a3e;">${fmtDateLong(date)}</td></tr>
      <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #2a2a3e;">Time</td>
          <td style="padding:10px 0;font-weight:600;border-bottom:1px solid #2a2a3e;">${timeDisplay}</td></tr>
      <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #2a2a3e;">Duration</td>
          <td style="padding:10px 0;font-weight:600;border-bottom:1px solid #2a2a3e;">${durationDisplay}</td></tr>
      <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #2a2a3e;">Total Paid</td>
          <td style="padding:10px 0;font-weight:600;color:#e94560;border-bottom:1px solid #2a2a3e;">$${totalPrice}</td></tr>
      ${orderNumber ? `<tr><td style="padding:10px 0;color:#888;">Order #</td>
          <td style="padding:10px 0;font-weight:600;">${orderNumber}</td></tr>` : ''}
    </table>
  </div>

  <div style="background:#1a1a2e;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
    <h3 style="color:#e94560;margin:0 0 12px;font-size:15px;">What's included</h3>
    <ul style="color:#aaa;margin:0;padding-left:20px;line-height:2;">
      <li>Theater seating with recliners for 3</li>
      <li>Ambient lighting &amp; 65" TV</li>
      <li>320W 3D surround sound system</li>
      <li>Streaming apps &amp; custom gaming table (6 seats)</li>
    </ul>
  </div>

  <div style="text-align:center;color:#555;font-size:12px;">
    <p>Questions? Email us at <a href="mailto:${process.env.GMAIL_USER}" style="color:#e94560;">${process.env.GMAIL_USER}</a></p>
    <p>Balance Gaming FL &mdash; Secret Lair Lounge</p>
  </div>
</div>`;

  await transporter().sendMail({
    from: `Balance Gaming FL <${process.env.GMAIL_USER}>`,
    to: customerEmail,
    subject: `Booking Confirmed – ${fmtDateLong(date)} | Balance Gaming FL`,
    html,
  });
}

async function sendAdminMessage({ customerEmail, customerName, subject, message }) {
  const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f1a;color:#e0e0e8;padding:32px;border-radius:12px;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#e94560;margin:0;font-size:22px;">BALANCE GAMING FL</h1>
  </div>
  <div style="background:#1a1a2e;border-radius:8px;padding:24px;">
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <div style="color:#bbb;line-height:1.7;">${message.replace(/\n/g, '<br>')}</div>
  </div>
  <div style="text-align:center;color:#555;font-size:12px;margin-top:20px;">
    <p>Balance Gaming FL &mdash; Secret Lair Lounge</p>
  </div>
</div>`;

  await transporter().sendMail({
    from: `Balance Gaming FL <${process.env.GMAIL_USER}>`,
    to: customerEmail,
    subject,
    html,
  });
}

module.exports = { sendConfirmationEmail, sendAdminMessage };
