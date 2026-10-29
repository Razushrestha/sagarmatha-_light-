function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function sendMail({ to, subject, text, html, from }) {
  if (!smtpConfigured()) {
    const error = new Error('SMTP is not configured. Set SMTP_HOST (and SMTP_USER / SMTP_PASS).');
    error.code = 'SMTP_MISSING';
    throw error;
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  await transporter.sendMail({
    from: from || process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER || 'nepatronix@localhost',
    to: String(to).trim(),
    subject,
    text,
    html,
  });
  return true;
}

module.exports = { smtpConfigured, isEmail, sendMail };
