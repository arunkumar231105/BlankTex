import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import dashboard from './routes/dashboard.js';
import suppliers from './routes/suppliers.js';
import contacts from './routes/contacts.js';
import warehouses from './routes/warehouses.js';
import manufacturers from './routes/manufacturers.js';
import brands from './routes/brands.js';
import styles from './routes/styles.js';
import colors from './routes/colors.js';
import sizes from './routes/sizes.js';
import specs from './routes/specs.js';
import skus from './routes/skus.js';
import prices from './routes/prices.js';
import images from './routes/images.js';
import imports from './routes/imports.js';
import decorations from './routes/decorations.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // large CSV imports

// Simple request log
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'blanktex-api' }));

app.use('/api/dashboard', dashboard);
app.use('/api/suppliers', suppliers);
app.use('/api/contacts', contacts);
app.use('/api/warehouses', warehouses);
app.use('/api/manufacturers', manufacturers);
app.use('/api/brands', brands);
app.use('/api/styles', styles);
app.use('/api/colors', colors);
app.use('/api/sizes', sizes);
app.use('/api/specs', specs);
app.use('/api/skus', skus);
app.use('/api/prices', prices);
app.use('/api/images', images);
app.use('/api/import', imports);
app.use('/api/decorations', decorations);

// 404
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.url}` }));

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  // Postgres unique/violation errors -> 409, otherwise 500
  const status = err.code === '23505' || err.code === '23503' || err.code === '23514' ? 409 : 500;
  res.status(status).json({ error: err.message, code: err.code });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`BlankTex API listening on http://localhost:${PORT}`));
