const http = require('http');
const https = require('https');
const { URL } = require('url');

function createSession(baseUrl) {
  const cookies = new Map();

  function cookieHeader() {
    return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function storeCookies(setCookie) {
    const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const raw of list) {
      const part = String(raw).split(';')[0];
      const eq = part.indexOf('=');
      if (eq > 0) cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }

  function request({ method = 'GET', path, json, query, headers: extraHeaders } = {}) {
    const url = new URL(path.startsWith('http') ? path : `${baseUrl.replace(/\/$/, '')}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    const body = json != null ? JSON.stringify(json) : null;
    const lib = url.protocol === 'https:' ? https : http;
    const headers = {
      Accept: 'application/json',
      Cookie: cookieHeader(),
      ...extraHeaders,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      }, (res) => {
        storeCookies(res.headers['set-cookie']);
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
          resolve({ status: res.statusCode, data, raw });
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => req.destroy(new Error(`Timeout ${method} ${path}`)));
      if (body) req.write(body);
      req.end();
    });
  }

  return {
    request,
    get: (path, query) => request({ method: 'GET', path, query }),
    post: (path, json) => request({ method: 'POST', path, json }),
    put: (path, json) => request({ method: 'PUT', path, json }),
    del: (path, json) => request({ method: 'DELETE', path, json }),
  };
}

module.exports = { createSession };
