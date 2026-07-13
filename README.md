# BlankTex — Product Management

Full-stack blank-apparel catalog: **Supplier → Brand → Style → Color/Size → SKU → Pricing**.

- **Database:** PostgreSQL 17 (`blanktex_schema.sql`)
- **Backend:** Node + Express + `pg` REST API (`/backend`)
- **Frontend:** React + Vite + Nginx (`/frontend`) — reproduces the dashboard mockup

---

## 🚀 Deploy with Docker (recommended — for the Hostinger server)

Only Docker is required on the server. The database schema is applied and demo
data seeded **automatically on first boot** — nothing to run by hand.

```bash
git clone <your-repo-url> blanktex
cd blanktex
docker compose up -d --build
```

Then open **http://31.97.110.197:8097**

- Public port and DB credentials live in the root **`.env`** (already set for the
  target server). Change `APP_PORT` there to serve on a different port.
- Data persists in the `pgdata` Docker volume across restarts/redeploys.
- Re-deploy after a `git pull`:  `docker compose up -d --build`
- Logs: `docker compose logs -f`   ·   Stop: `docker compose down`
  (add `-v` to also wipe the database volume and re-seed on next start).

### What runs
| Container | Image | Port | Role |
|---|---|---|---|
| `frontend` | Nginx | **8097 → 80** | serves the built React app, proxies `/api` → backend |
| `backend`  | Node 22 | internal 4000 | REST API; auto-inits + seeds the DB on start |
| `db`       | postgres:17 | internal 5432 | PostgreSQL (not exposed publicly) |

---

## 🖥️ Local development (without Docker)

### Prerequisites
- Node.js 18+ (tested on 22)
- PostgreSQL 14+ running locally (tested on 17)

## 1. Configure the database connection
Edit `backend/.env` with your local PostgreSQL superuser credentials:

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password_here
PGDATABASE=blanktex
PORT=4000
```

## 2. Backend — install, create DB
```bash
cd backend
npm install
npm run db:setup   # creates the "blanktex" database + applies the schema (empty, no demo data)
npm run dev        # starts API on http://localhost:4000
```

## 3. Frontend — install and run
```bash
cd frontend
npm install
npm run dev        # opens http://localhost:5173  (proxies /api -> :4000)
```

Open **http://localhost:5173**.

---

## Using the app
The database starts **empty** — you enter all data through the UI. Build your catalog in order:
1. **Suppliers** → add a supplier, click it to add **contacts** and **warehouses**.
2. **Brands** → add brands. The **logo** field takes an image URL (paste a **Nextcloud share
   link** or any public image URL) — it's stored in the DB and a live preview renders.
3. **Styles** → add a style, open it, then use the tabs:
   - **Colors** — add each color (with a hex swatch).
   - **Sizes** — add sizes; each size has a **Specs** button for garment/print measurements.
   - **SKUs** — click **Generate SKUs** to create every Color × Size combination, then set
     **Prices** per SKU per supplier.

Every entity has full Add / Edit / Delete. Deletes are blocked when a record is referenced
(e.g. a brand with styles) — set it inactive instead. The sidebar collapses via the ☰ button.

> **Images:** the only image column in the schema is `brand_logo`. Styles/colors have no image
> column by design (schema unchanged). To show product/color images later, add a `VARCHAR(255)`
> image-URL column to `styles`/`style_colors` and it will slot straight into the same URL+preview field.

## API endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` · `/api/dashboard/stats` | liveness · overview counts |
| CRUD | `/api/suppliers` | suppliers |
| CRUD + `GET /by-supplier/:id` | `/api/contacts` · `/api/warehouses` | nested supplier data |
| CRUD | `/api/brands` | brands (incl. `brand_logo` URL) |
| CRUD + `GET /:id` | `/api/styles` | styles (`:id` returns colors+sizes+specs) |
| POST | `/api/styles/:id/generate-skus` | build all Color×Size SKUs |
| CRUD + `GET /by-style/:id` | `/api/colors` · `/api/sizes` · `/api/skus` | per-style children |
| GET + `PUT /by-size/:id` | `/api/specs` | upsert size specs (1:1) |
| CRUD + `GET /by-sku/:id` | `/api/prices` | supplier prices per SKU |

## Project layout
```
BlankTex/
├── blanktex_schema.sql      # PostgreSQL DDL (10 tables) — unchanged
├── docker-compose.yml       # db + backend + frontend
├── .env                     # APP_PORT=8097 + DB creds (committed for the server)
├── backend/src/
│   ├── server.js  db.js  init.js  setup.js
│   └── routes/    # dashboard, suppliers, contacts, warehouses, brands,
│                  # styles, colors, sizes, specs, skus, prices
└── frontend/src/
    ├── api.js  styles.css  App.jsx
    ├── ui/         # Modal, Toast, ConfirmDialog, Field, Form, ResourceManager
    ├── lib/        # enums, render helpers
    ├── components/ # Sidebar (collapsible), Topbar
    └── pages/      # Dashboard, Suppliers(+Detail), Brands, Styles(+Detail /style tabs)
```
