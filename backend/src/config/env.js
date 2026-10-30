const WEAK_SECRETS = new Set([
  'nepatronix-erp-jwt-secret-key-2026',
  'your-super-secret-jwt-key-change-in-production',
]);

function assertProductionEnv() {
  const missing = [];
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const secret = String(process.env.JWT_SECRET);
    if (secret.length < 32 || WEAK_SECRETS.has(secret)) {
      throw new Error(
        'JWT_SECRET is too weak for production. Set a long random value in backend/.env (32+ characters).'
      );
    }
    if (!process.env.FRONTEND_URL) {
      console.warn('FRONTEND_URL is not set. CORS will only allow same-origin and localhost.');
    }
  }
}

function frontendPort() {
  return Number(process.env.FRONTEND_PORT || 3016);
}

function backendPort() {
  // Prefer BACKEND_PORT so a leftover PORT=5000 cannot override a deliberate 5016.
  return Number(process.env.BACKEND_PORT || process.env.PORT || 5000);
}

function mongoPort() {
  return Number(process.env.MONGODB_PORT || 27017);
}

function corsOrigins() {
  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const webPort = frontendPort();
  return new Set([
    process.env.FRONTEND_URL,
    ...extra,
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
  ].filter(Boolean));
}

function impersonateMs() {
  const minutes = Number(process.env.IMPERSONATE_MINUTES || 30);
  const clamped = Math.min(60, Math.max(15, Number.isFinite(minutes) ? minutes : 30));
  return clamped * 60 * 1000;
}

function cookieOptions() {
  const secure =
    process.env.COOKIE_SECURE === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
  return {
    httpOnly: true,
    secure,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function mongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const host = process.env.MONGODB_HOST || '127.0.0.1';
  const db = process.env.MONGODB_DB || 'sagarmatha_light_solution';
  return `mongodb://${host}:${mongoPort()}/${db}`;
}

module.exports = {
  assertProductionEnv,
  corsOrigins,
  cookieOptions,
  impersonateMs,
  frontendPort,
  backendPort,
  mongoPort,
  mongoUri,
};
