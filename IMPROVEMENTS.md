# Lung Cancer Analytics Dashboard — Improvement Guide

## What's Been Delivered

Two drop-in replacements for your `public/` folder:
- `dashboard.html` — fully redesigned, multi-section SPA
- `login.html` — dark medical theme with animated background

Both connect to your **existing** Express/MongoDB backend unchanged.

---

## UI/UX Changes (dashboard.html)

### New sections (sidebar navigation):
| Section | URL anchor | What it shows |
|---|---|---|
| Dashboard | `#dashboard` | KPI cards, doughnut chart, bar chart, dataset table, activity feed |
| Statistics | `#statistics` | Optimizer comparison (Adam/SGD/RMSProp), confusion matrix heatmap |
| Reports | `#reports` | Printable summary with all techniques and final metrics |
| Admin Panel | `#admin` | Form to POST new stats to `/stats` |

### Design system:
- Font: **DM Sans** (UI) + **Space Mono** (metrics/numbers)
- Color: Deep navy `#0a0f1e` base, blue accent `#4f7cff`, semantic teal/coral/amber/green
- Per-section color-coded cards with top-border accent strips
- Fully responsive — collapses to single column on mobile with hamburger menu

---

## Backend Improvements (server.js)

### Add JWT auth middleware to protect `/stats` POST:

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const auth = req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ message: 'Invalid token' });
  }
};
```

```js
// In server.js
const authMiddleware = require('./middleware/auth');
app.post('/stats', authMiddleware, async (req, res) => { ... });
```

### Add `.env` support:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/lungCancerDB
JWT_SECRET=your_secret_here
```

```js
require('dotenv').config(); // top of server.js
```

Install: `npm install dotenv`

---

## Docker Setup

### Dockerfile:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml:
```yaml
version: '3.9'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      MONGO_URI: mongodb://mongo:27017/lungCancerDB
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - mongo
    restart: unless-stopped

  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongo_data:
```

Run: `docker compose up --build`

---

## CI/CD — GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test   # add Jest tests here

  docker:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: yourdockerhub/lung-cancer-dashboard:latest
```

---

## Recommended Project Structure (after improvements)

```
lung-cancer-dashboard/
├── .env
├── .github/
│   └── workflows/
│       └── deploy.yml
├── Dockerfile
├── docker-compose.yml
├── server.js
├── middleware/
│   └── auth.js            ← NEW: JWT middleware
├── routes/
│   ├── auth.js            ← NEW: separate route files
│   └── stats.js
├── models/
│   ├── User.js
│   └── Stats.js
├── public/
│   ├── login.html         ← REPLACED
│   ├── dashboard.html     ← REPLACED
│   ├── style.css          ← can now be minimal (styles are inline)
│   └── script.js
└── package.json
```

---

## Next Steps (Priority Order)

1. **Drop in the new HTML files** → immediate visual upgrade, zero backend changes
2. **Add `.env` + dotenv** → 10 min, fixes hardcoded secrets
3. **Add JWT middleware** → protects your POST /stats endpoint
4. **Dockerize** → `docker compose up` for one-command local dev
5. **Add GitHub Actions CI** → auto-build on every push to main
6. **Add Jest tests** for your API routes → required for CI to be meaningful
