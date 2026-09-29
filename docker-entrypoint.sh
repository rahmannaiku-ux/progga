#!/bin/sh
set -e

# Apply any pending versioned migrations (prisma/migrations/) before
# starting. Never swap this for `db push` in production -- it has no
# history and can drop data.
if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "No prisma/migrations found yet — skipping migrate deploy. Apply the schema with 'npx prisma db push' before first run, or generate a real migration history with 'npx prisma migrate dev'."
fi

exec node server.js
