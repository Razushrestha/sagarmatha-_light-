# Host this ERP on your server

Three processes, three ports. Frontend uses **3016** because 3000–3015 are taken on the server.

| Service | Default port | Bind | Public |
|---|---|---|---|
| Frontend (Next.js) | **3016** | `0.0.0.0` | Yes (browser) |
| Backend (Express API) | **5000** | `0.0.0.0` | No — keep private; Next.js proxies `/api` |
| MongoDB | **27017** | `127.0.0.1` | No — localhost only |

You need **Node.js 18+**, **MongoDB**, and preferably **Nginx** in front.

## 1. Copy the project and install

```bash
cd "/path/to/sagarmatha light solution"
npm run install:all
```

## 2. MongoDB on port 27017

Do not expose this port on the internet.

Linux (`/etc/mongod.conf`):

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1
```

Windows (as Administrator):

```bat
mongod --port 27017 --bind_ip 127.0.0.1 --dbpath "C:\data\db"
```

If you change the Mongo port, set `MONGODB_PORT` and `MONGODB_URI` to match.

## 3. Backend config (port 5000)

Copy `backend/.env.example` to `backend/.env` and set:

- `PORT=5000` and `BACKEND_PORT=5000`
- `FRONTEND_PORT=3016`
- `MONGODB_URI=mongodb://127.0.0.1:27017/sagarmatha_light_solution`
- `JWT_SECRET` – a long random string (32+ characters). Do not use the example value.
- `FRONTEND_URL` – `http://YOUR_SERVER_IP:3016` or `https://erp.yourdomain.com`
- `NODE_ENV=production`
- `TRUST_PROXY=true` if Nginx is used
- `COOKIE_SECURE=true` if you use HTTPS
- For HTTP-only LAN hosting, set `COOKIE_SECURE=false` or login cookies will not save

## 4. Frontend config (port 3016)

Copy `frontend/.env.example` to `frontend/.env.production`:

```
NEXT_PUBLIC_API_URL=/api
FRONTEND_PORT=3016
BACKEND_PORT=5000
BACKEND_URL=http://127.0.0.1:5000
```

The browser only talks to port **3016**. Next.js proxies `/api` and `/uploads` to the backend on **5000**.

To use other high ports, change `FRONTEND_PORT`, `BACKEND_PORT`, and `MONGODB_PORT` in `.env`, `frontend/.env.production`, and restart PM2. Keep all three different.

## 5. Build and start

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

Open the app at `http://YOUR_SERVER_IP:3016`.

Health check: `http://127.0.0.1:5000/api/health`

## 6. Nginx (HTTPS)

Point your domain to the frontend port 3016. Example:

```nginx
server {
  listen 443 ssl;
  server_name erp.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3016;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Do not publish MongoDB (27017) or the API port (5000) to the public internet.

## 7. First login

Use an existing admin user from your database. If the database is empty, run seed **once** on a copy, not on a live database with real data:

```bash
cd backend && npm run seed
```

Then change the default admin password.
