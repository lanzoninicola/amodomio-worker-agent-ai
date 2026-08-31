FROM node:20.19.0-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.19.0-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const fs=require('node:fs');const p='/tmp/whatsapp-agent-worker-heartbeat';const s=fs.statSync(p);if(Date.now()-s.mtimeMs>90000)process.exit(1)"

CMD ["npm", "start"]
