const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const FROM = `"Balance Gaming FL" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;
const BASE = process.env.BASE_URL || 'http://localhost:3001';

async function sendWelcomeEmail({ to, name, nextBillingDate }) {
  const portalUrl = `${BASE}/portal`;
  const billingStr = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Next month';

  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Welcome to the Elite Membership!',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a2e">Welcome, ${name || 'Member'}!</h2>
        <p>You're now an <strong>Elite Member</strong> at Balance Gaming FL.</p>
        <div style="background:#f5f5f7;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px;font-weight:600">Your 10% member discount</p>
          <p style="margin:0;color:#555;font-size:14px">
            Your <strong>Elite10</strong> discount is automatically applied on sealed products
            when you're logged into your account at checkout — no code needed.
          </p>
        </div>
        <p><strong>Next billing date:</strong> ${billingStr}</p>
        <p><a href="${portalUrl}" style="background:#e94560;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Manage Your Membership</a></p>
        <p style="color:#777;font-size:13px">You can view your membership status and cancel anytime from the member portal.</p>
      </div>
    `,
  });
}

async function sendMagicLinkEmail({ to, name, token }) {
  const link = `${BASE}/portal?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your Balance Gaming member portal link',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a2e">Sign in to your member portal</h2>
        <p>Hi${name ? ` ${name}` : ''},</p>
        <p>Click the button below to access your Elite Member dashboard. This link expires in 7 days.</p>
        <p><a href="${link}" style="background:#e94560;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Open Member Portal</a></p>
        <p style="color:#777;font-size:13px">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

async function sendCancellationEmail({ to, name }) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your Elite Membership has been cancelled',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a2e">Membership Cancelled</h2>
        <p>Hi${name ? ` ${name}` : ''},</p>
        <p>Your Elite Membership at Balance Gaming FL has been cancelled. Your Elite10 discount will no longer apply at checkout.</p>
        <p>We hope to see you back soon — you can rejoin anytime at <a href="${BASE}">our membership page</a>.</p>
      </div>
    `,
  });
}

async function sendRenewalEmail({ to, name, nextBillingDate }) {
  const billingStr = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Next month';
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Elite Membership renewed',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a2e">Membership Renewed</h2>
        <p>Hi${name ? ` ${name}` : ''},</p>
        <p>Your Elite Membership has been renewed for another month. Your Elite10 discount remains active at checkout.</p>
        <p><strong>Next billing date:</strong> ${billingStr}</p>
      </div>
    `,
  });
}

module.exports = { sendWelcomeEmail, sendMagicLinkEmail, sendCancellationEmail, sendRenewalEmail };
