#!/bin/bash

# Add all env vars from .env.local to Vercel production
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue

  # Skip if value is empty
  [[ -z "$value" ]] && continue

  echo "Adding $key..."
  echo "$value" | vercel env add "$key" production
done < .env.local

echo "✓ All env vars added to Vercel"
