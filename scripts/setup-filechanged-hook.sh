#!/usr/bin/env bash
# TICKET-021 §D — FileChanged hook setup verifier
#
# Run once per Warp tab (UI / Backend / Algorithm / Database) before
# launching Claude Code. Verifies:
#   1. .claude/settings.json present + valid JSON
#   2. scripts/hooks/on-telepot-changed.cjs present + executable
#   3. DEPT env var set to one of the 4 dept values
#   4. Smoke-runs the hook with a fake stdin payload to confirm it fires
#      desktop notification + JSON stdout output
#
# Usage:
#   export DEPT=ui   # or backend / algorithm / database
#   bash scripts/setup-filechanged-hook.sh
#
# Exit codes:
#   0 — all 4 checks pass, ready to launch `claude`
#   1 — at least 1 check failed; remediation printed
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
blue()   { printf "\033[34m%s\033[0m\n" "$*"; }

fail=0
step() { echo; blue "── $1 ──"; }

step "1/4  Verify .claude/settings.json exists + parses"
if [[ ! -f .claude/settings.json ]]; then
  red "❌ .claude/settings.json missing"
  fail=1
elif ! node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))" 2>/dev/null; then
  red "❌ .claude/settings.json present but does not parse as JSON"
  fail=1
else
  green "✅ .claude/settings.json present + valid JSON"
fi

step "2/4  Verify hook script exists + executable"
HOOK="scripts/hooks/on-telepot-changed.cjs"
if [[ ! -f "$HOOK" ]]; then
  red "❌ $HOOK missing"
  fail=1
elif [[ ! -x "$HOOK" ]]; then
  yellow "⚠️  $HOOK present but not executable — fixing with chmod +x"
  chmod +x "$HOOK"
  green "✅ $HOOK now executable"
else
  green "✅ $HOOK present + executable"
fi

step "3/4  Verify DEPT env var"
DEPT_VAL="${DEPT:-}"
case "$DEPT_VAL" in
  ui|backend|algorithm|database)
    green "✅ DEPT=$DEPT_VAL (valid)"
    ;;
  "")
    red "❌ DEPT not set — set it BEFORE launching claude: export DEPT=ui (or backend/algorithm/database)"
    fail=1
    ;;
  *)
    red "❌ DEPT='$DEPT_VAL' invalid — must be one of: ui / backend / algorithm / database"
    fail=1
    ;;
esac

step "4/4  Dry-run hook with fake stdin payload"
if [[ -n "$DEPT_VAL" && -x "$HOOK" ]]; then
  FAKE_PATH="$REPO_ROOT/_bridge/telepot_${DEPT_VAL}.md"
  PAYLOAD="{\"session_id\":\"setup-dry-run\",\"cwd\":\"$REPO_ROOT\",\"hook_event_name\":\"FileChanged\",\"file_path\":\"$FAKE_PATH\",\"change\":\"modified\"}"
  OUT=$(echo "$PAYLOAD" | node "$HOOK")
  if echo "$OUT" | grep -q "additionalContext"; then
    green "✅ Hook fires correctly — stdout contains additionalContext payload:"
    echo "$OUT" | head -1
    yellow "(Desktop notification should also have appeared.)"
  else
    red "❌ Hook dry-run did not produce expected stdout (got: $OUT)"
    fail=1
  fi
else
  yellow "⏭️  Skipping dry-run (DEPT or hook executable check failed)"
fi

echo
if [[ $fail -eq 0 ]]; then
  green "════════════════════════════════════════════════════════════"
  green "✅ ${DEPT_VAL} FileChanged hook installed and verified"
  green "════════════════════════════════════════════════════════════"
  blue  "Next step:"
  blue  "  1. Keep DEPT=${DEPT_VAL} in this Warp tab's shell env"
  blue  "  2. Launch \`claude\` from this tab"
  blue  "  3. CEO writes/updates _bridge/telepot_${DEPT_VAL}.md → you'll see a desktop notification"
  blue  "  4. Switch to this Warp tab + type any message (e.g. 'go' or 'process telepot')"
  blue  "  5. Claude reads the ticket via the additionalContext hint + runs the workflow"
  exit 0
else
  red "════════════════════════════════════════════════════════════"
  red "❌ FileChanged hook setup INCOMPLETE — fix issues above and re-run"
  red "════════════════════════════════════════════════════════════"
  exit 1
fi
