#!/bin/sh
set -e

# This repo doesn't have a prisma/migrations history yet (schema changes
# have been applied with `prisma db push` during development) — running
# `prisma migrate deploy` against an empty migrations/ directory is a
# no-op, not an error, so this is safe to leave in place now and it'll
# start doing real work the first time `npx prisma migrate dev` is run
# to generate an actual migration history. Do NOT swap this for
# `db push` in production — db push is a dev convenience command, not
# a safe deployment mechanism (no history, no rollback path).
if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "No prisma/migrations found yet — skipping migrate deploy. Apply the schema with 'npx prisma db push' before first run, or generate a real migration history with 'npx prisma migrate dev'."
fi

exec node server.js
