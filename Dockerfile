# Stage 1: Build the frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build the Vite frontend
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx

# Copy built frontend dist
COPY --from=builder /app/dist ./dist

# Copy server and TypeScript source needed at runtime
COPY server.ts ./
COPY tsconfig.json ./
COPY src ./src

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Pre-create the directory so volumes don't overwrite ownership easily
VOLUME /app/data

USER node

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "node_modules/.bin/tsx", "server.ts"]
