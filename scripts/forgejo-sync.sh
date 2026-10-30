#!/usr/bin/env bash
#
# forgejo-sync.sh — secure, host-side autonomous Git sync to Forgejo.
#
# Pushes ONLY master and feat/* to the authoritative Forgejo remote, with strict
# guardrails. Designed to be invoked after successful integration + verification
# (event-driven) or as a deterministic no-LLM cron script. It NEVER pushes
# production, tags, or unrelated refs, NEVER force-pushes, and refuses to run
# with a dirty tree, failing tests, or divergent remote state.
#
# SECURITY:
#   - Runs ON THE HOST, using the host's existing SSH key (the host SSH key (see ~/.ssh/config)).
#   - The key is NEVER read, copied, printed, or exposed to a Mate workspace.
#   - No Kiro Crew internals are modified; this is a plain host script + git.
#
# USAGE:
#   scripts/forgejo-sync.sh --dry-run     # default: show what WOULD happen, push nothing
#   scripts/forgejo-sync.sh --push        # actually push (only after dry-run looks right)
#   scripts/forgejo-sync.sh --push --skip-tests   # push without running tests (NOT recommended)
#
# EXIT CODES: 0 = success/no-op; non-zero = a guardrail stopped the sync.
#
# DISABLE: remove/pause the cron job (kirocrew cron remove <id>), or simply stop
#   invoking this script. It changes nothing on its own. See docs/GIT_WORKFLOW.md.

set -euo pipefail

# ---- Configuration ----------------------------------------------------------
REPO_DIR="/workspace/projects/aws-map-it"
REMOTE="origin"
# Branches allowed to sync. test and production are DELIBERATELY excluded —
# they are protected staging/release branches, advanced ONLY by approved Forgejo
# PRs, and auto-deployed to AWS. This script must never push them.
ALLOWED_BRANCHES_REGEX='^(master|feat/.+)$'
# Defense-in-depth: an explicit deny-list that is checked INDEPENDENTLY of the
# allow-list. Even if the allow-list is ever loosened, these never sync here.
DENIED_BRANCHES_REGEX='^(test|production)$'
# feat/* branches are published only when explicitly requested (--publish-feat),
# so a routine master sync never drags a half-done feature branch to the remote.
LOG_FILE="${FORGEJO_SYNC_LOG:-$REPO_DIR/.forgejo-sync.log}"
# Pin SSH to the user config so a broken system ssh_config.d include cannot
# abort parsing (the documented root cause). The key stays on the host. Uses
# $HOME so no username is hardcoded; override via FORGEJO_SSH_CONFIG if needed.
SSH_CONFIG="${FORGEJO_SSH_CONFIG:-$HOME/.ssh/config}"
SSH_CMD="ssh -F $SSH_CONFIG -o BatchMode=yes -o ConnectTimeout=10"

MODE="dry-run"
RUN_TESTS=1
PUBLISH_FEAT=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --push) MODE="push" ;;
    --skip-tests) RUN_TESTS=0 ;;
    --publish-feat) PUBLISH_FEAT=1 ;;  # opt-in to push a feat/* branch
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log() {
  local line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$MODE] $*"
  echo "$line"
  echo "$line" >> "$LOG_FILE"
}

fail() { log "STOP: $*"; exit 1; }

cd "$REPO_DIR"
export GIT_SSH_COMMAND="$SSH_CMD"

log "=== forgejo-sync start (mode=$MODE, tests=$RUN_TESTS) ==="

# ---- Guard 1: on an allowed branch; never a protected branch ---------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "current branch: $BRANCH"
# Deny-list first (independent hard stop for test/production).
if [[ "$BRANCH" =~ $DENIED_BRANCHES_REGEX ]]; then
  fail "branch '$BRANCH' is a PROTECTED branch (test/production) — advanced only by approved Forgejo PR, never by this script."
fi
if ! [[ "$BRANCH" =~ $ALLOWED_BRANCHES_REGEX ]]; then
  fail "branch '$BRANCH' is not in the allowed set (master, feat/*). test/production/tags/others are never pushed."
fi
# feat/* requires explicit opt-in so a routine sync never publishes a feature
# branch by accident.
if [[ "$BRANCH" == feat/* ]] && [ "$PUBLISH_FEAT" -ne 1 ]; then
  fail "on feature branch '$BRANCH' but --publish-feat not given. Feature-branch publishing is explicit; re-run with --publish-feat to push it."
fi

# ---- Guard 2: no uncommitted changes ---------------------------------------
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "working tree has uncommitted changes; refusing to push."
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "index/worktree not clean; refusing to push."
fi
log "working tree clean"

# ---- Guard 3: fetch first; reject divergent/unexpected remote state --------
log "fetching $REMOTE (read-only)..."
if ! git fetch --no-tags "$REMOTE" "$BRANCH" 2>>"$LOG_FILE"; then
  fail "git fetch failed (SSH/remote unreachable?). Not pushing."
fi

REMOTE_REF="refs/remotes/$REMOTE/$BRANCH"
if git show-ref --verify --quiet "$REMOTE_REF"; then
  LOCAL_SHA="$(git rev-parse "$BRANCH")"
  REMOTE_SHA="$(git rev-parse "$REMOTE_REF")"
  log "local=$LOCAL_SHA remote=$REMOTE_SHA"
  if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
    log "already up to date; nothing to push."
    exit 0
  fi
  # Fast-forward only: remote must be an ancestor of local. Anything else is
  # divergent — STOP (never force, never rewrite).
  if ! git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA"; then
    fail "remote '$BRANCH' has diverged (remote is not an ancestor of local). Manual reconciliation required; refusing to force-push."
  fi
  log "remote is fast-forwardable from local"
else
  log "remote branch '$BRANCH' does not exist yet; will publish it (new branch)."
fi

# ---- Guard 4: tests/build green (for master; feat/* optional) --------------
if [ "$RUN_TESTS" -eq 1 ]; then
  log "running verification (validator + typecheck + build + tests)..."
  VALIDATE_OK=1
  python3 data/validate.py >>"$LOG_FILE" 2>&1 || VALIDATE_OK=0
  [ "$VALIDATE_OK" -eq 1 ] || fail "dataset validator failed; refusing to push."
  # Use the project's local node bins (node_modules may be a local-disk symlink).
  node node_modules/typescript/lib/tsc.js -b --noEmit >>"$LOG_FILE" 2>&1 || fail "typecheck failed; refusing to push."
  node node_modules/vite/bin/vite.js build >>"$LOG_FILE" 2>&1 || fail "production build failed; refusing to push."
  node node_modules/vitest/vitest.mjs run >>"$LOG_FILE" 2>&1 || fail "tests failed; refusing to push."
  log "verification passed"
else
  log "tests skipped (--skip-tests)"
fi

# ---- Push (explicit single refspec; never --force, never --tags) -----------
# --force-with-lease is NOT used; we only fast-forward. Explicit refspec means
# only THIS branch is pushed — no mirror, no tags, no other refs.
PUSH_ARGS=("$REMOTE" "refs/heads/$BRANCH:refs/heads/$BRANCH")
if [ "$MODE" = "dry-run" ]; then
  log "DRY-RUN: would run -> git push --no-force --dry-run ${PUSH_ARGS[*]}"
  if git show-ref --verify --quiet "$REMOTE_REF" || true; then
    git push --dry-run "${PUSH_ARGS[@]}" >>"$LOG_FILE" 2>&1 \
      && log "DRY-RUN: git push --dry-run succeeded (no changes made)" \
      || log "DRY-RUN: git push --dry-run could not reach remote (SSH down?) — see log"
  fi
  log "=== dry-run complete; NOTHING pushed ==="
  exit 0
fi

log "pushing $BRANCH -> $REMOTE (fast-forward only)..."
git push "${PUSH_ARGS[@]}" >>"$LOG_FILE" 2>&1 || fail "git push failed; see log."
log "=== PUSHED $BRANCH successfully ==="
exit 0
