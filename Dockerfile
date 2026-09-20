# ---- deps ----
FROM node:20-alpine AS deps
# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder ----
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- runner ----
FROM node:20-alpine AS runner
# tzdata + TZ so logs and any stray Date formatting are in Bangladesh time.
# (All user-visible dates are pinned to Asia/Dhaka in src/lib/timezone.ts
# regardless of this.)
RUN apk add --no-cache openssl libc6-compat tzdata
WORKDIR /app
ENV TZ=Asia/Dhaka
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# The Next.js standalone build only bundles what its dependency tracer
# sees imported by server code — it does NOT include `prisma` (the CLI),
# since that's invoked as a separate process via `npx`, not imported.
# Without these, docker-entrypoint.sh's `npx prisma migrate deploy`
# would fail at container start with "command not found". `prisma` is a
# devDependency in package.json (correctly — it's a build/ops tool, not
# app runtime code), so it has to be copied explicitly here rather than
# moved into `dependencies` just to satisfy the standalone tracer.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
