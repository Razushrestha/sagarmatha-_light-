const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { getRedis } = require('../config/redis');
const { recordJob } = require('./metrics');
const { cacheGet, cacheSet } = require('./cache');

const memoryResults = new Map();

let queue = null;
let worker = null;
let connection = null;
const handlers = {};
const lastErrors = [];

function pushJobError(name, message, tenantId) {
  lastErrors.unshift({
    at: new Date().toISOString(),
    name: name || 'job',
    message: String(message || 'unknown'),
    tenantId: tenantId ? String(tenantId) : null,
  });
  if (lastErrors.length > 30) lastErrors.length = 30;
}

function registerJob(name, handler) {
  handlers[name] = handler;
}

function jobResultKey(tenantId, id) {
  return `erp:${tenantId}:jobs:${id}`;
}

async function setJobResult(key, value, ttlSeconds = 3600) {
  memoryResults.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
  await cacheSet(key, value, ttlSeconds);
}

async function getJobResult(key) {
  const row = memoryResults.get(key);
  if (row) {
    if (row.exp > Date.now()) return row.value;
    memoryResults.delete(key);
  }
  return cacheGet(key);
}

function redisConnUrl() {
  return process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
}

async function startJobs() {
  if (queue) return;
  if (!getRedis()) {
    console.log('Job queue runs inline until Redis is available.');
    return;
  }

  try {
    connection = new IORedis(redisConnUrl(), { maxRetriesPerRequest: null });
    queue = new Queue('nepatronix-erp', { connection });

    if (process.env.JOB_WORKER === 'false') {
      console.log('BullMQ producer only (JOB_WORKER=false). Run a worker process to process jobs.');
      return;
    }

    worker = new Worker(
      'nepatronix-erp',
      async (job) => {
        const handler = handlers[job.name];
        if (!handler) throw new Error(`No handler for job ${job.name}`);
        await handler({ ...job.data, jobId: job.data.jobId || String(job.id) });
      },
      { connection: connection.duplicate(), concurrency: Number(process.env.JOB_CONCURRENCY || 2) }
    );
    worker.on('failed', (job, err) => {
      pushJobError(job?.name, err.message, job?.data?.tenantId);
      console.warn(`Job ${job?.name} failed: ${err.message}`);
    });
    console.log('BullMQ worker ready (reports and background jobs).');
  } catch (error) {
    queue = null;
    console.warn(`Job queue inline: ${error.message}`);
  }
}

async function enqueue(name, data = {}) {
  const handler = handlers[name];
  recordJob('enqueued');

  const jobId = data.jobId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = { ...data, jobId };

  if (queue) {
    await queue.add(name, payload, {
      jobId,
      removeOnComplete: 50,
      removeOnFail: 20,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return jobId;
  }

  recordJob('inline');
  if (handler) {
    setImmediate(() => {
      Promise.resolve(handler(payload)).catch((err) => {
        pushJobError(name, err.message, payload.tenantId);
        console.warn(`Inline job ${name} failed: ${err.message}`);
      });
    });
  }
  return jobId;
}

function jobsStatus() {
  return {
    queue: Boolean(queue),
    worker: Boolean(worker),
    mode: queue ? (worker ? 'redis-worker' : 'redis-producer') : 'inline',
    errors: lastErrors.slice(0, 10),
  };
}

async function closeJobs() {
  try {
    if (worker) await worker.close();
    if (queue) await queue.close();
    if (connection) await connection.quit();
  } catch {
    // ignore
  }
}

module.exports = { registerJob, startJobs, enqueue, closeJobs, jobsStatus, jobResultKey, setJobResult, getJobResult };
