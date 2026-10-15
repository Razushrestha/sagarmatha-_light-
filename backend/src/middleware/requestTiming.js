const { recordHttp } = require('../utils/metrics');

function requestTiming(req, res, next) {
  if (req.path === '/health' || req.path === '/api/health') return next();
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    recordHttp(req.path, ms);
  });
  next();
}

module.exports = { requestTiming };
