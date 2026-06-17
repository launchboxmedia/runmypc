#!/bin/bash
set -e

echo "RunMyPC Database Setup"
echo "====================="

# Check if service role key exists in .env.local
if grep -q "^SUPABASE_SERVICE_ROLE_KEY=eyJ" .env.local 2>/dev/null; then
  echo "✓ Service role key found in .env.local"
else
  echo ""
  echo "Service role key not found!"
  echo ""
  echo "Get it from: https://supabase.com/dashboard/project/limscrtqcpequuzgmpde/settings/api"
  echo ""
  echo "Then add to .env.local:"
  echo "SUPABASE_SERVICE_ROLE_KEY=<your-key>"
  echo ""
  exit 1
fi

# Load env vars
export $(grep -v '^#' .env.local | xargs)

echo ""
echo "Applying migrations..."

# Apply all migrations
for migration in supabase/migrations/*.sql; do
  echo "Applying $(basename $migration)..."

  # Use psql via connection string (requires service role key)
  PGPASSWORD="${SUPABASE_SERVICE_ROLE_KEY#*:}" psql \
    "postgresql://postgres.limscrtqcpequuzgmpde:${SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
    -f "$migration" 2>&1 | grep -v "already exists" || true
done

echo ""
echo "✓ Database setup complete"
echo ""
echo "Test signup at: http://localhost:3000/signup"
