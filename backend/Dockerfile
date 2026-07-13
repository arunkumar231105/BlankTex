# Backend API image. Build context is the REPO ROOT (see docker-compose.yml)
# so we can also copy blanktex_schema.sql into the image.
FROM node:22-alpine

WORKDIR /app

# Install production dependencies first (better layer caching)
COPY backend/package*.json ./
RUN npm install --omit=dev

# App source
COPY backend/ ./

# Schema lives at the repo root; place it where init.js expects (SCHEMA_PATH)
COPY blanktex_schema.sql /app/blanktex_schema.sql

ENV NODE_ENV=production
EXPOSE 4000

# Auto-init the DB (schema-if-missing, seed-if-empty) then start the API.
CMD ["sh", "-c", "node src/init.js && node src/server.js"]
