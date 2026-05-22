#!/usr/bin/env node
/**
 * FileChanged hook handler — TICKET-021 §C
 *
 * Wired by `.claude/settings.json` to fire whenever any of the 4 dept telepot
 * files change on disk. The hook receives JSON via stdin per Claude Code's
 * official contract (docs.claude.com/hooks):
 *
 *   { session_id, transcript_path, cwd, hook_event_name, file_path, change }
 *
 * It branches on `$DEPT` env var (set per Warp tab before launching `claude`)
 * to ensure ONLY the matching dept's Claude Code instance acts. Other 3 tabs
 * exit silently — same shared settings.json fires on all 4 tabs, but only
 * the dept-matched one notifies.
 *
 * Side effects:
 *   1. macOS desktop notification (osascript) — primary signal to boss
 *   2. JSON output to stdout with `additionalContext` — best-effort hint that
 *      Claude reads on its next turn (schema not formally in hooks.md, so
 *      this is opportunistic, not load-bearing)
 *   3. Append-only audit log at `_bridge/.hook_audit.log` — debug trail
 *
 * IMPORTANT — what this hook CANNOT do (verified against official docs):
 *   - It cannot inject `process telepot` slash command (Claude Code hooks
 *     are explicitly scoped to "stdout / stderr / exit code only — cannot
 *     trigger / commands or tool calls")
 *   - It cannot wake an idle Claude session — additionalContext only reaches
 *     Claude when the user sends the next message in that tab
 *
 * So the boss workflow is: notification appears → boss glances at matching
 * Warp tab → types ANY message (e.g. "go") → Claude reads injected
 * additionalContext + recognizes the new ticket → runs process telepot
 * workflow. This is a step shorter than today, not zero-touch.
 *
 * Loop safety: FileChanged hook does NOT fire on Claude's own Edit/Write
 * (verified against docs.claude.com/hooks). So Claude editing a response
 * file or telepot_<dept>.md to mark STATUS=in_progress will not retrigger.
 */
const { spawn } = require('node:child_process');
const fs        = require('node:fs');
const path      = require('node:path');

function readStdinSync() {
  try {
    // Claude Code hooks send a single JSON payload then close stdin.
    return fs.readFileSync(0, 'utf8');
  } catch { return ''; }
}

function audit(line) {
  try {
    const stamp = new Date().toISOString();
    // /tmp keeps the audit trail off the repo (no .gitignore churn) while
    // remaining readable for debugging. macOS / Linux both honor /tmp.
    fs.appendFileSync('/tmp/nutri-pilot-hook-audit.log', `[${stamp}] ${line}\n`);
  } catch { /* best-effort, never block hook */ }
}

(function main() {
  let payload = {};
  try { payload = JSON.parse(readStdinSync() || '{}'); }
  catch { payload = {}; }

  const filePath = String(payload.file_path || '');
  const change   = String(payload.change    || '');
  const dept     = String(process.env.DEPT  || '').toLowerCase().trim();

  // No DEPT set on this tab → this isn't a wired dept tab; bail silently.
  // (Allows non-dept Claude Code instances to ignore the hook entirely.)
  if (!dept) {
    audit(`SKIP no_dept file=${filePath} change=${change}`);
    process.exit(0);
  }

  // Match: file basename ends with telepot_<dept>.md (case-insensitive).
  // Skip response files (telepot_response_*.md) — those are Lead-written.
  const base = path.basename(filePath);
  const wantBase = `telepot_${dept}.md`;
  if (base.toLowerCase() !== wantBase.toLowerCase()) {
    audit(`SKIP wrong_dept dept=${dept} want=${wantBase} got=${base}`);
    process.exit(0);
  }

  // Skip "deleted" — only fire on created / modified.
  if (change === 'deleted') {
    audit(`SKIP deletion file=${filePath}`);
    process.exit(0);
  }

  // ── Match — fire notification + additionalContext ───────────────────────
  const deptUpper = dept.toUpperCase();
  const title     = `${deptUpper} ticket landed`;
  const msg       = `📨 New ticket on ${wantBase} — switch to ${deptUpper} tab and type 'process telepot'`;

  // 1) macOS desktop notification (load-bearing — even if Claude is idle,
  //    boss sees the popup and knows which tab to focus).
  try {
    spawn('osascript', [
      '-e',
      `display notification "${msg.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" sound name "Submarine"`,
    ], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* osascript unavailable (non-mac) — notification is best-effort */ }

  // 2) Opportunistic additionalContext for Claude's next turn. The schema
  //    isn't formally in hooks.md, so we output a defensive shape with
  //    common field names. If Claude Code ignores it, the notification
  //    still informs the boss.
  const out = {
    additionalContext: [
      `[FileChanged hook] ${wantBase} was modified externally (${change}).`,
      `A new CEO ticket likely landed. Run \`process telepot\` to read and act on it.`,
    ].join(' '),
    systemMessage: `New ${deptUpper} ticket detected — run process telepot.`,
  };
  process.stdout.write(JSON.stringify(out));

  audit(`FIRED dept=${dept} file=${filePath} change=${change}`);
  process.exit(0);
})();
