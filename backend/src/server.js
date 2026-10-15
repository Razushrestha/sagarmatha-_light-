const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const connectDB = require('./config/db');
const { connectRedis, redisStatus, closeRedis, onRedisReady } = require('./config/redis');
const { startJobs, closeJobs, jobsStatus } = require('./utils/jobs');
const { registerJobs } = require('./jobs/register');
const { apiLimiter } = require('./middleware/rateLimiters');
const { requestTiming } = require('./middleware/requestTiming');
const { mountApi } = require('./routes');
const { assertProductionEnv, corsOrigins, backendPort } = require('./config/env');
const { cacheHitRate } = require('./utils/metrics');
const { startHealthWatch, stopHealthWatch, status: healthStatus } = require('./utils/healthWatch');

const isProd = process.env.NODE_ENV === 'production';

try {
  assertProductionEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = express();

if (isProd || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(compression());

const allowedOrigins = corsOrigins();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(requestTiming);
app.use(morgan(isProd ? 'combined' : 'dev', {
  skip: (req) => req.path === '/api/health',
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: isProd ? '7d' : 0,
  etag: true,
}));

app.get('/api/health', (req, res) => {
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  res.json({
    success: true,
    message: 'Nepatronix ERP API is running',
    version: '1.0.0',
    env: isProd ? 'production' : 'development',
    mongo: 'connected',
    redis: redisStatus(),
    jobs: jobsStatus(),
    cacheHitRate: cacheHitRate(),
    rssMb,
    alerts: healthStatus(),
  });
});

const PORT = backendPort();
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  await connectDB();
  try {
    await require('./services/platformSettings').loadPlatformSettings();
  } catch (error) {
    console.warn(`Platform settings: ${error.message}`);
  }
  await connectRedis();
  registerJobs();
  await startJobs();
  onRedisReady(() => startJobs());

  app.use('/api/', apiLimiter(isProd));
  mountApi(app);

  app.use((err, req, res, next) => {
    if (err && err.message === 'Not allowed by CORS') {
      return res.status(403).json({ success: false, message: 'Origin not allowed.' });
    }
    console.error(isProd ? err.message : err.stack);
    res.status(500).json({
      success: false,
      message: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
    });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`API listening on ${HOST}:${PORT} (${isProd ? 'production' : 'development'})`);
    startHealthWatch();
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Closing server...`);
    server.close(async () => {
      try {
        stopHealthWatch();
        await closeJobs();
        await closeRedis();
        const mongoose = require('mongoose');
        await mongoose.connection.close();
      } catch {
        // ignore
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
