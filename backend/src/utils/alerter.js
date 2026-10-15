const https = require('https');

function alertsEnabled() {
  if (process.env.ALERTS_ENABLED === 'true') return true;
  if (process.env.ALERTS_ENABLED === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const target = new URL(url);
    const req = https.request({
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await postJson(url, { chat_id: chat, text, disable_web_page_preview: true });
  return res.status === 200;
}

async function sendEmail(subject, text) {
  const to = process.env.ALERT_EMAIL_TO;
  const host = process.env.SMTP_HOST;
  if (!to || !host) return false;
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.warn('nodemailer is not installed; skip email alerts.');
    return false;
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  await transporter.sendMail({
    from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER || 'nepatronix@localhost',
    to,
    subject,
    text,
  });
  return true;
}

async function pageOps({ key, title, body, recovered = false }) {
  const prefix = recovered ? 'Recovered' : 'Alert';
  const subject = `[Nepatronix] ${prefix}: ${title}`;
  const text = `${subject}\n\n${body}\n\nTime: ${new Date().toISOString()}\nHost: ${process.env.HOST || 'api'}\nKey: ${key}`;
  const sent = [];
  try {
    if (await sendTelegram(text)) sent.push('telegram');
  } catch (error) {
    console.warn(`Telegram alert failed: ${error.message}`);
  }
  try {
    if (await sendEmail(subject, text)) sent.push('email');
  } catch (error) {
    console.warn(`Email alert failed: ${error.message}`);
  }
  if (!sent.length) {
    console.warn(`${subject}\n${body}`);
  } else {
    console.log(`Ops ${prefix.toLowerCase()} sent via ${sent.join(', ')}: ${title}`);
  }
  return sent;
}

function channelsConfigured() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    email: Boolean(process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO),
  };
}

module.exports = { alertsEnabled, pageOps, channelsConfigured };
