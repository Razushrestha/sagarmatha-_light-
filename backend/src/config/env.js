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

function corsOrigins() {
  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([
    process.env.FRONTEND_URL,
    ...extra,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean));
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

module.exports = { assertProductionEnv, corsOrigins, cookieOptions };
