#!/bin/bash
# Auto-retry wrapper for gen-dish-steps.ts — restarts on network failure.
# Each iteration is idempotent (only picks dishes with prep_steps_json IS NULL),
# so re-running picks up where the previous run died.
#
# Stops when:
#   - Successful exit (no pending dishes left)
#   - 5 consecutive failures within 1 minute (probably a hard problem)

cd /Users/jianjiao/Desktop/nutri-pilot
export VITE_GEMINI_API_KEY=$(grep VITE_GEMINI_API_KEY .env | cut -d= -f2)

MAX_RETRY=20
fails=0
for i in $(seq 1 $MAX_RETRY); do
  echo "=== attempt $i/$MAX_RETRY at $(date '+%H:%M:%S') ==="
  if npx tsx scripts/gen-dish-steps.ts --limit=999; then
    echo "=== success on attempt $i ==="
    exit 0
  else
    fails=$((fails+1))
    echo "=== attempt $i failed; sleeping 30s before retry ==="
    sleep 30
  fi
done
echo "=== gave up after $MAX_RETRY attempts ==="
exit 1
