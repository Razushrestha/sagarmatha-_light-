# Host this ERP on your server

You need **Node.js 18+**, **MongoDB**, and preferably **Nginx** in front.

## 1. Copy the project and install

```bash
cd "/path/to/sagarmatha light solution"
npm run install:all
```

## 2. Backend config

Copy `backend/.env.example` to `backend/.env` and set:

- `MONGODB_URI` – your MongoDB connection string
- `JWT_SECRET` – a long random string (32+ characters). Do not use the example value.
- `FRONTEND_URL` – public site URL, for example `https://erp.yourdomain.com`
- `NODE_ENV=production`
- `TRUST_PROXY=true` if Nginx or another reverse proxy is used
- `COOKIE_SECURE=true` if you use HTTPS
- For HTTP-only LAN hosting, set `COOKIE_SECURE=false` or login cookies will not save

## 3. Frontend config

Copy `frontend/.env.example` to `frontend/.env.production` (or `.env.local`):

```
NEXT_PUBLIC_API_URL=/api
BACKEND_URL=http://127.0.0.1:5000
```

Keep the API as `/api` so the browser talks to the same domain. Next.js proxies `/api` and `/uploads` to the backend.

## 4. Build and start

```bash
npm run build
```

Then either:

```bash
npm run start:api
npm run start:web
```

Or with PM2:

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

API: port **5000**. Website: port **3000**.

## 5. Nginx (HTTPS)

Point your domain to port 3000. Example:

```nginx
server {
  listen 443 ssl;
  server_name erp.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Do not expose MongoDB or port 5000 to the public internet.

## 6. First login

Use an existing admin user from your database. If the database is empty, run seed **once** on a copy, not on a live database with real data:

```bash
cd backend && npm run seed
```

Then change the default admin password.

Health check: `http://127.0.0.1:5000/api/health`
