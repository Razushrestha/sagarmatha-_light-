const rateLimit = require('express-rate-limit');
const { getRedis } = require('../config/redis');

function redisStore(prefix, windowMs) {
  return {
    async increment(key) {
      const redis = getRedis();
      if (!redis) return { totalHits: 1, resetTime: new Date(Date.now() + windowMs) };
      const redisKey = `${prefix}${key}`;
      const totalHits = await redis.incr(redisKey);
      if (totalHits === 1) await redis.pexpire(redisKey, windowMs);
      const ttl = await redis.pttl(redisKey);
      return {
        totalHits,
        resetTime: new Date(Date.now() + Math.max(ttl, 0)),
      };
    },
    async decrement(key) {
      const redis = getRedis();
      if (!redis) return;
      await redis.decr(`${prefix}${key}`);
    },
    async resetKey(key) {
      const redis = getRedis();
      if (!redis) return;
      await redis.del(`${prefix}${key}`);
    },
  };
}

function limiter({ windowMs, max, message }) {
  const redis = getRedis();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    ...(redis ? { store: redisStore('rl:', windowMs) } : {}),
  });
}

function apiLimiter(isProd) {
  return limiter({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || (isProd ? 800 : 2000)),
  });
}

function loginLimiter() {
  return limiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  });
}

function signupLimiter() {
  return limiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many signup attempts. Try again later.' },
  });
}

module.exports = { apiLimiter, loginLimiter, signupLimiter };
