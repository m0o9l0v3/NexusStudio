FROM node:22-alpine AS build
WORKDIR /src
COPY apps/studio-web/package*.json ./
RUN npm ci
COPY apps/studio-web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY apps/studio-web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
