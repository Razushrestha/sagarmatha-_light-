const Redis = require('ioredis');

let client = null;
let ready = false;
let reconnectTimer = null;
const lastErrors = [];
const readyHooks = [];

function pushRedisError(message) {
  lastErrors.unshift({ at: new Date().toISOString(), message: String(message || 'unknown') });
  if (lastErrors.length > 20) lastErrors.length = 20;
}

function redisUrl() {
  if (process.env.REDIS_DISABLED === 'true') return null;
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || 6379;
  return `redis://${host}:${port}`;
}

function onRedisReady(fn) {
  readyHooks.push(fn);
  if (ready) {
    Promise.resolve(fn()).catch((err) => console.warn(`Redis ready hook: ${err.message}`));
  }
}

function markReady() {
  if (ready) return;
  ready = true;
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  console.log('Redis connected (cache, rate limits, job queues). MongoDB stays source of truth.');
  for (const fn of readyHooks) {
    Promise.resolve(fn()).catch((err) => console.warn(`Redis ready hook: ${err.message}`));
  }
}

function markDown(message) {
  ready = false;
  if (message) pushRedisError(message);
}

async function tryConnect() {
  const url = redisUrl();
  if (!url || ready) return client;

  if (client) {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
    client = null;
  }

  const next = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
    lazyConnect: true,
    retryStrategy() {
      return null;
    },
  });

  next.on('error', (err) => {
    markDown(err.message);
  });
  next.on('ready', () => {
    client = next;
    markReady();
  });
  next.on('close', () => {
    if (client === next) {
      markDown('connection closed');
      scheduleReconnect();
    }
  });

  try {
    await next.connect();
    await next.ping();
    client = next;
    markReady();
    return client;
  } catch (error) {
    markDown(error.message);
    try {
      next.disconnect();
    } catch {
      // ignore
    }
    if (client === next) client = null;
    return null;
  }
}

function scheduleReconnect() {
  if (process.env.REDIS_DISABLED === 'true') return;
  if (ready || reconnectTimer) return;
  const ms = Number(process.env.REDIS_RECONNECT_MS || 10000);
  reconnectTimer = setInterval(() => {
    if (ready) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }
    tryConnect().catch(() => {});
  }, ms);
  reconnectTimer.unref();
}

async function connectRedis() {
  const url = redisUrl();
  if (!url) {
    console.log('Redis disabled. MongoDB remains the source of truth.');
    return null;
  }
  const connected = await tryConnect();
  if (!connected) {
    console.warn('Redis unavailable. API continues with MongoDB only. Will retry until Redis is up.');
    scheduleReconnect();
  }
  return connected;
}

function getRedis() {
  return ready ? client : null;
}

function redisStatus() {
  return ready ? 'connected' : 'offline';
}

function redisErrors() {
  return lastErrors.slice(0, 10);
}

async function closeRedis() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (!client) return;
  const current = client;
  client = null;
  ready = false;
  try {
    await current.quit();
  } catch {
    try {
      current.disconnect();
    } catch {
      // ignore
    }
  }
}

module.exports = {
  connectRedis,
  getRedis,
  redisStatus,
  redisErrors,
  closeRedis,
  onRedisReady,
};
