# Imagen de cv-web (Next.js standalone, Node 22). Multi-stage: dependencias -> build -> runtime mínimo.
#
# Construir y probar en local (hace falta la API del CV en CV_API_URL para que las páginas respondan):
#   docker build -t cv-web .
#   docker run --rm -p 3000:3000 -e CV_API_URL=http://host.docker.internal:8080 -e SITE_URL=http://localhost:3000 cv-web
# El build NO lee la API: los datos se piden en cada render. Variables de runtime: CV_API_URL y SITE_URL (ver deploy/docker-compose.yml).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Next escribe aquí en runtime; debe ser del usuario no root.
RUN mkdir -p .next/cache && chown -R app:app .next/cache
USER app
EXPOSE 3000
# Con barra final: trailingSlash=true redirige /api/health a /api/health/. Sale 1 si responde distinto de 2xx o no responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Forma exec: node es el PID 1 y recibe SIGTERM directamente.
CMD ["node", "server.js"]
