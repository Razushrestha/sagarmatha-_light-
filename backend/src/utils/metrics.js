const samples = [];
const slowQueries = [];
const MAX_SAMPLES = 400;
const MAX_SLOW = 40;
const SLOW_MS = Number(process.env.MONGO_SLOW_MS || 150);

const cache = { hits: 0, misses: 0, writes: 0 };
const mongo = { queries: 0, slow: 0, totalMs: 0 };
const jobs = { enqueued: 0, completed: 0, failed: 0, inline: 0 };

function recordHttp(path, ms) {
  samples.push({ t: Date.now(), path, ms });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

function recordCache(hit) {
  if (hit) cache.hits += 1;
  else cache.misses += 1;
}

function recordCacheWrite() {
  cache.writes += 1;
}

function recordMongoQuery(model, ms, op) {
  mongo.queries += 1;
  mongo.totalMs += ms;
  if (ms < SLOW_MS) return;
  mongo.slow += 1;
  slowQueries.unshift({
    at: new Date().toISOString(),
    t: Date.now(),
    model,
    op,
    ms: Math.round(ms),
  });
  if (slowQueries.length > MAX_SLOW) slowQueries.pop();
}

function slowQueriesInWindow(windowMs = 5 * 60 * 1000) {
  const since = Date.now() - windowMs;
  return slowQueries.filter((row) => (row.t || Date.parse(row.at) || 0) >= since).length;
}

function recordJob(kind) {
  if (jobs[kind] !== undefined) jobs[kind] += 1;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 10) / 10;
}

function cacheHitRate() {
  const total = cache.hits + cache.misses;
  if (!total) return null;
  return Math.round((cache.hits / total) * 1000) / 10;
}

function scaleRecommendations({ rssMb, p95, hitRate, redisReady, replica }) {
  const tips = [];
  if (rssMb >= 700) {
    tips.push('API RSS is high. Add another Node process behind the reverse proxy (pm2 -i 2+) and keep one BullMQ worker.');
  }
  if (p95 >= 400) {
    tips.push('p95 latency is high. Confirm Mongo indexes, then add API instances. Do not add Redis as a substitute for slow queries.');
  }
  if (mongo.slow >= 8) {
    tips.push('Repeated slow Mongo queries. Inspect /platform metrics slowQueries, add compound tenant indexes, or move to a replica set / larger Atlas tier.');
  }
  if (hitRate !== null && hitRate < 35 && cache.hits + cache.misses >= 40) {
    tips.push('Cache hit rate is low. Product and dashboard keys may be expiring too fast or invalidating on every write.');
  }
  if (!redisReady) {
    tips.push('Redis is offline. Cache, shared rate limits and BullMQ are disabled; run Redis before adding API instances.');
  }
  if (replica && process.env.MONGO_READ_PREFERENCE === 'primary') {
    tips.push('Mongo reports a replica set. Set MONGO_READ_PREFERENCE=secondaryPreferred for read-heavy dashboards.');
  }
  if (!tips.length) {
    tips.push('No scale-up signal yet. Keep one API process until p95, RSS or slow queries climb.');
  }
  return tips;
}

async function snapshot() {
  const { getRedis, redisStatus } = require('../config/redis');
  const mongoose = require('mongoose');
  const redis = getRedis();
  const mem = process.memoryUsage();
  const recent = samples.filter((s) => Date.now() - s.t < 5 * 60 * 1000);
  const latencies = recent.map((s) => s.ms);
  const rssMb = Math.round((mem.rss / 1024 / 1024) * 10) / 10;
  const p95 = percentile(latencies, 95);
  const hitRate = cacheHitRate();
  const redisReady = redisStatus() === 'connected';

  let redisMemory = null;
  if (redis) {
    try {
      const info = await redis.info('memory');
      const used = /used_memory_human:(\S+)/.exec(info);
      const peak = /used_memory_peak_human:(\S+)/.exec(info);
      redisMemory = {
        used: used ? used[1] : null,
        peak: peak ? peak[1] : null,
      };
    } catch {
      redisMemory = null;
    }
  }

  let replica = false;
  try {
    const admin = mongoose.connection?.db?.admin?.();
    if (admin) {
      const status = await admin.replSetGetStatus();
      replica = Boolean(status?.ok);
    }
  } catch {
    replica = false;
  }

  return {
    process: {
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      rssMb,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      jobWorker: process.env.JOB_WORKER !== 'false',
    },
    latency: {
      sampleCount: latencies.length,
      avgMs: latencies.length
        ? Math.round((latencies.reduce((s, n) => s + n, 0) / latencies.length) * 10) / 10
        : 0,
      p95Ms: p95,
      window: '5m',
    },
    cache: {
      hits: cache.hits,
      misses: cache.misses,
      writes: cache.writes,
      hitRatePercent: hitRate,
      redis: redisStatus(),
      redisMemory,
    },
    mongo: {
      readyState: mongoose.connection.readyState,
      queries: mongo.queries,
      slow: mongo.slow,
      avgMs: mongo.queries ? Math.round((mongo.totalMs / mongo.queries) * 10) / 10 : 0,
      slowMsThreshold: SLOW_MS,
      poolSize: Number(process.env.MONGO_POOL_SIZE || 20),
      readPreference: process.env.MONGO_READ_PREFERENCE || 'primary',
      replica,
      slowQueries: slowQueries.slice(0, 15),
      slowLast5m: slowQueriesInWindow(5 * 60 * 1000),
    },
    jobs: { ...jobs },
    scale: {
      recommendations: scaleRecommendations({ rssMb, p95, hitRate, redisReady, replica }),
    },
  };
}

module.exports = {
  recordHttp,
  recordCache,
  recordCacheWrite,
  recordMongoQuery,
  recordJob,
  snapshot,
  cacheHitRate,
  slowQueriesInWindow,
};
