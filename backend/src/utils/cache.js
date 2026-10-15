const { getRedis } = require('../config/redis');
const { getTenantId } = require('./tenantContext');
const { recordCache, recordCacheWrite } = require('./metrics');

function tenantKey(parts) {
  const tid = getTenantId() || 'none';
  return ['erp', tid, ...parts].join(':');
}

async function cacheGet(key) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) {
      recordCache(false);
      return null;
    }
    recordCache(true);
    return JSON.parse(raw);
  } catch {
    recordCache(false);
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    recordCacheWrite();
  } catch {
    // Mongo path still works
  }
}

async function cacheDelPattern(pattern) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = [];
    const stream = redis.scanStream({ match: pattern, count: 100 });
    await new Promise((resolve, reject) => {
      stream.on('data', (batch) => {
        if (batch?.length) keys.push(...batch);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    if (keys.length) await redis.del(keys);
  } catch {
    // ignore
  }
}

async function invalidateShopCache(scopes = ['products', 'dashboard', 'reports']) {
  const tid = getTenantId() || 'none';
  await Promise.all(
    scopes.map((scope) => cacheDelPattern(`erp:${tid}:${scope}:*`))
  );
}

module.exports = { tenantKey, cacheGet, cacheSet, cacheDelPattern, invalidateShopCache };
