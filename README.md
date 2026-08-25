# sagarmatha-_light-

Sagarmatha Light Solution ERP (NepaTronix) — Next.js frontend and Express + MongoDB API.

## Stack

- Frontend: Next.js 14 (`frontend/`, port 3000)
- Backend: Express (`backend/`, port 5000)
- Database: MongoDB

## Local development

```bash
npm run install:all
```

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`, then start the API and web app.

Do not commit `.env` files. Production hosting notes are in `HOSTING.md`.
