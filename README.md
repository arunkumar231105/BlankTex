# BlankTex — Product Management

Full-stack blank-apparel catalog: **Supplier → Brand → Style → Color/Size → SKU → Pricing**.

- **Database:** PostgreSQL 17 (`blanktex_schema.sql`)
- **Backend:** Node + Express + `pg` REST API (`/backend`)
- **Frontend:** React + Vite + Nginx (`/frontend`) — reproduces the dashboard mockup

---

## 🚀 Deploy with Docker (recommended — for the Hostinger server)

Only Docker is required on the server. The database schema and the verified
DIGI/Gildan catalog are applied **automatically on first boot**.

```bash
git clone <your-repo-url> blanktex
cd blanktex
cp .env.example .env          # then edit .env and set a strong POSTGRES_PASSWORD
docker compose up -d --build
```

Then open **http://31.97.110.197:8097**

- Public port and DB credentials live in the root **`.env`** (git-ignored — never
  committed). `cp .env.example .env` and set `POSTGRES_PASSWORD`. Change `APP_PORT`
  there to serve on a different port. Compose refuses to start if the password is unset.
- Data persists in the `pgdata` Docker volume across restarts/redeploys.
- Re-deploy after a `git pull`:  `docker compose up -d --build`
- Logs: `docker compose logs -f`   ·   Stop: `docker compose down`
  (add `-v` to wipe the database volume and reload the verified catalog on next start).

### What runs
| Container | Image | Port | Role |
|---|---|---|---|
| `frontend` | Nginx | **8097 → 80** | serves the built React app, proxies `/api` → backend |
| `backend`  | Node 22 | internal 4000 | REST API; auto-inits + safely loads the catalog |
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
npm run db:setup   # creates the "blanktex" database + applies the schema
npm run db:catalog # safely loads catalog if DB is empty; add -- --replace for an explicit reset
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
The database starts with the verified DIGI/Gildan catalog. You can then maintain it through the UI:
1. **Suppliers** → add commercial suppliers, contacts and warehouses when those details are known.
2. **Brands** → DIGI and Gildan are preloaded; brand logos can use a public image URL.
3. **Styles** → open a preloaded style and use the tabs:
   - **Colors** — source names and supplier codes are loaded; hex remains blank when not supplied.
   - **Sizes** — source measurements are stored in centimeters, including chest/waist/hip and category-specific dimensions.
   - **Decorations** — exact DTF/DTG color and size availability from the supplied export.
   - **SKUs** — exact supplier SKU combinations are loaded. Prices/barcodes remain blank because
     the source catalog did not provide them.

Every entity has full Add / Edit / Delete. Deletes are blocked when a record is referenced
(e.g. a brand with styles) — set it inactive instead. The sidebar collapses via the ☰ button.

> **Images:** one source-embedded primary product image is included for every catalog style.

## API endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` · `/api/dashboard/stats` | liveness · overview counts |
| CRUD | `/api/suppliers` | suppliers |
| CRUD + `GET /by-supplier/:id` | `/api/contacts` · `/api/warehouses` | nested supplier data |
| CRUD | `/api/brands` | brands (incl. `brand_logo` URL) |
| CRUD + `GET /:id` | `/api/styles` | styles (`:id` returns colors+sizes+specs) |
| POST | `/api/styles/:id/generate-skus` | build all Color×Size SKUs |
| CRUD + `GET /by-style/:id` | `/api/colors` · `/api/sizes` · `/api/decorations` · `/api/skus` | per-style children |
| GET + `PUT /by-size/:id` | `/api/specs` | upsert size specs (1:1) |
| CRUD + `GET /by-sku/:id` | `/api/prices` | supplier prices per SKU |

## Project layout
```
BlankTex/
├── blanktex_schema.sql      # PostgreSQL catalog schema
├── docker-compose.yml       # db + backend + frontend
├── .env                     # APP_PORT=8097 + DB creds (committed for the server)
├── backend/src/
│   ├── server.js  db.js  init.js  setup.js  catalog.js  catalog-data.json
│   └── routes/    # dashboard, suppliers, contacts, warehouses, brands,
│                  # styles, colors, sizes, specs, decorations, skus, prices
└── frontend/src/
    ├── api.js  styles.css  App.jsx
    ├── ui/         # Modal, Toast, ConfirmDialog, Field, Form, ResourceManager
    ├── lib/        # enums, render helpers
    ├── components/ # Sidebar (collapsible), Topbar
    └── pages/      # Dashboard, Suppliers(+Detail), Brands, Styles(+Detail /style tabs)
```
