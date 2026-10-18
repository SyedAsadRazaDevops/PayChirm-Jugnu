# Jugnu Alert: Cloud Run alert service (API + static Screen and Console pages).
# Build:  docker build -t jugnu-alert .
# Run:    docker run --rm -p 8080:8080 -e MOCK_GEMINI=true jugnu-alert

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public
USER node
# Cloud Run injects PORT (8080 by default).
EXPOSE 8080
CMD ["node", "dist/index.js"]
