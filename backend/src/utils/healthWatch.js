const fs = require('fs');
const path = require('path');
const { redisStatus } = require('../config/redis');
const { slowQueriesInWindow } = require('./metrics');
const { alertsEnabled, pageOps, channelsConfigured } = require('./alerter');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const STATE_PATH = path.join(__dirname, '../../.alert-state.json');
const REDIS_DOWN_MS = Number(process.env.ALERT_REDIS_DOWN_MS || 5 * 60 * 1000);
const DISK_PERCENT = Number(process.env.ALERT_DISK_PERCENT || 80);
const SLOW_WINDOW_MS = Number(process.env.ALERT_MONGO_SLOW_WINDOW_MS || 5 * 60 * 1000);
const SLOW_COUNT = Number(process.env.ALERT_MONGO_SLOW_COUNT || 10);
const COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS || 6 * 60 * 60 * 1000);
const BACKUP_AFTER_HOUR = Number(process.env.ALERT_BACKUP_AFTER_HOUR || 8);
const TICK_MS = Number(process.env.ALERT_TICK_MS || 60 * 1000);

let timer = null;
let lastRun = null;
const memory = { redisDownSince: null };

function backupRoot() {
  return process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn(`Could not persist alert state: ${error.message}`);
  }
}

function diskFor(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stats = fs.statfsSync(dir);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (!total) return null;
    const usedPercent = Math.round(((total - free) / total) * 1000) / 10;
    return { path: dir, usedPercent, totalGb: Math.round(total / (1024 ** 3) * 10) / 10 };
  } catch {
    return null;
  }
}

function latestBackupAt() {
  const root = backupRoot();
  const stampFile = path.join(root, 'LAST_OK');
  try {
    if (fs.existsSync(stampFile)) {
      const raw = fs.readFileSync(stampFile, 'utf8').trim();
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) return t;
    }
  } catch {
    // fall through to dump folders
  }
  if (!fs.existsSync(root)) return null;
  const dumps = fs.readdirSync(root)
    .filter((name) => name.startsWith('dump-'))
    .map((name) => {
      try {
        return fs.statSync(path.join(root, name)).mtimeMs;
      } catch {
        return 0;
      }
    })
    .filter(Boolean);
  if (!dumps.length) return null;
  return Math.max(...dumps);
}

function startOfLocalDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

function cooledDown(entry, now) {
  return !entry?.lastSent || now - entry.lastSent >= COOLDOWN_MS;
}

async function fire(state, key, title, body) {
  const now = Date.now();
  const entry = state[key] || {};
  if (entry.open && !cooledDown(entry, now)) return false;
  const sent = await pageOps({ key, title, body, recovered: false });
  state[key] = { ...entry, open: true, lastSent: now, lastTitle: title, channels: sent };
  saveState(state);
  return true;
}

async function recover(state, key, title, body) {
  const entry = state[key];
  if (!entry?.open) return false;
  await pageOps({ key, title, body, recovered: true });
  state[key] = { ...entry, open: false, recoveredAt: Date.now() };
  saveState(state);
  return true;
}

async function checkRedis(state) {
  if (process.env.REDIS_DISABLED === 'true') {
    memory.redisDownSince = null;
    return;
  }
  const up = redisStatus() === 'connected';
  if (up) {
    memory.redisDownSince = null;
    await recover(state, 'redis', 'Redis is back', 'Cache, rate limits and job queue can run again.');
    return;
  }
  if (!memory.redisDownSince) memory.redisDownSince = Date.now();
  const downMs = Date.now() - memory.redisDownSince;
  if (downMs < REDIS_DOWN_MS) return;
  const minutes = Math.round(downMs / 60000);
  await fire(
    state,
    'redis',
    `Redis has been down for ${minutes} min`,
    'Cache, shared rate limits and BullMQ are offline. Mongo is still the source of truth, but jobs and multi-instance cache will not work until Redis is started.'
  );
}

async function checkDisk(state) {
  const volumes = [diskFor(UPLOADS_ROOT), diskFor(backupRoot())].filter(Boolean);
  const hot = volumes.filter((row) => row.usedPercent >= DISK_PERCENT);
  if (!hot.length) {
    await recover(state, 'disk', 'Disk usage is back under the limit', `Threshold is ${DISK_PERCENT}%.`);
    return;
  }
  const detail = hot.map((row) => `${row.path}: ${row.usedPercent}% of ${row.totalGb} GB`).join('\n');
  await fire(state, 'disk', `Disk usage above ${DISK_PERCENT}%`, detail);
}

async function checkMongoSlow(state) {
  const count = slowQueriesInWindow(SLOW_WINDOW_MS);
  if (count < SLOW_COUNT) {
    if (state.mongo_slow?.open && count === 0) {
      await recover(state, 'mongo_slow', 'Mongo slow-query spike settled', `Window is ${Math.round(SLOW_WINDOW_MS / 60000)} min.`);
    }
    return;
  }
  await fire(
    state,
    'mongo_slow',
    `Mongo slow queries spiked (${count} in ${Math.round(SLOW_WINDOW_MS / 60000)} min)`,
    `Threshold is ${SLOW_COUNT} queries slower than ${process.env.MONGO_SLOW_MS || 150} ms. Check /platform metrics slowQueries and tenant indexes.`
  );
}

async function checkBackup(state) {
  const hour = new Date().getHours();
  if (hour < BACKUP_AFTER_HOUR) return;
  const last = latestBackupAt();
  const yesterdayStart = startOfLocalDay(-1);
  if (last && last >= yesterdayStart) {
    if (state.backup?.open) {
      await recover(state, 'backup', 'Mongo backup is current again', `Last backup: ${new Date(last).toISOString()}`);
    }
    return;
  }
  const dayKey = new Date().toISOString().slice(0, 10);
  if (state.backup?.lastSentDay === dayKey) return;
  const age = last ? `${Math.round((Date.now() - last) / 3600000)} hours ago` : 'never';
  const sent = await fire(
    state,
    'backup',
    'Mongo backup missed yesterday',
    `Expected a dump in ${backupRoot()} from yesterday or today. Last successful backup: ${age}. Run npm run backup-mongo (or the daily schtask/cron).`
  );
  if (sent) {
    state.backup = { ...(state.backup || {}), lastSentDay: dayKey, open: true, lastSent: Date.now() };
    saveState(state);
  }
}

async function tick() {
  lastRun = new Date().toISOString();
  if (!alertsEnabled()) return;
  const channels = channelsConfigured();
  if (!channels.telegram && !channels.email) return;
  const state = loadState();
  await checkRedis(state);
  await checkDisk(state);
  await checkMongoSlow(state);
  await checkBackup(state);
}

function status() {
  const state = loadState();
  const channels = channelsConfigured();
  return {
    armed: alertsEnabled() && (channels.telegram || channels.email),
    channels,
    lastRun,
    redisDownSince: memory.redisDownSince,
    diskPercentLimit: DISK_PERCENT,
    mongoSlowLimit: SLOW_COUNT,
    open: Object.entries(state)
      .filter(([, row]) => row && row.open)
      .map(([key, row]) => ({ key, lastSent: row.lastSent, title: row.lastTitle })),
  };
}

function startHealthWatch() {
  if (process.env.JOB_WORKER === 'false' && process.env.ALERT_WATCHDOG !== 'true') {
    console.log('Health watchdog skipped (JOB_WORKER=false). Set ALERT_WATCHDOG=true on one API process.');
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.warn(`Health watch: ${err.message}`));
  }, TICK_MS);
  timer.unref();
  setTimeout(() => tick().catch(() => {}), 8000).unref();
  const channels = channelsConfigured();
  if (alertsEnabled() && (channels.telegram || channels.email)) {
    console.log(`Health watchdog armed (${[
      channels.telegram ? 'Telegram' : null,
      channels.email ? 'email' : null,
    ].filter(Boolean).join(', ')}).`);
  } else {
    console.log('Health watchdog idle. Set TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID and/or SMTP + ALERT_EMAIL_TO (and ALERTS_ENABLED=true in development).');
  }
}

function stopHealthWatch() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startHealthWatch, stopHealthWatch, status, tick };
