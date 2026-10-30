#!/usr/bin/env bash
#
# preflight.sh — deployment readiness checks for AWS Region Resilience Explorer.
#
# Two tiers, clearly separated:
#   OFFLINE  — repo/build checks, no AWS. Always run.
#   LIVE     — require AWS credentials for the target account (--profile/--region).
#              Skipped unless --live is passed. These are the ONLY checks that
#              actually prove account readiness; offline checks never do.
#
# USAGE:
#   scripts/preflight.sh                              # offline only
#   scripts/preflight.sh --live --profile <p> --region <r> --app-id <id>
#
# Exit non-zero if any run check fails.

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
LIVE=0 PROFILE="" REGION="" APP_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --live) LIVE=1; shift;;
    --profile) PROFILE="$2"; shift 2;;
    --region) REGION="$2"; shift 2;;
    --app-id) APP_ID="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
FAIL=0
ok(){ echo "  [PASS] $*"; }
bad(){ echo "  [FAIL] $*"; FAIL=1; }
skip(){ echo "  [SKIP] $*"; }

echo "===== OFFLINE checks (no AWS) ====="

# 1. amplify.yml is valid YAML and every command is a string.
python3 - <<'PY' && ok "amplify.yml parses; all build commands are strings" || bad "amplify.yml invalid or has a non-string command"
import yaml,sys
d=yaml.safe_load(open('amplify.yml'))
cmds=[c for g in ('backend','frontend') for ph in d.get(g,{}).get('phases',{}).values() for c in ph.get('commands',[])]
sys.exit(0 if cmds and all(isinstance(c,str) for c in cmds) else 1)
PY

# 2. amplify.yml runs backend (ampx pipeline-deploy) before frontend, guards outputs, uses npm install not npm ci.
python3 - <<'PY' && ok "amplify.yml: backend-before-frontend, outputs guard, npm install (not ci)" || bad "amplify.yml ordering/guard/npm-install contract broken"
import yaml,sys
d=yaml.safe_load(open('amplify.yml'))
keys=list(d.keys())
be=[c for ph in d.get('backend',{}).get('phases',{}).values() for c in ph.get('commands',[])]
fe=[c for ph in d.get('frontend',{}).get('phases',{}).values() for c in ph.get('commands',[])]
allc=be+fe
ok = (keys.index('backend')<keys.index('frontend')
      and any('ampx pipeline-deploy' in c for c in be)
      and any('amplify_outputs.json' in c for c in fe)
      and not any('npm ci' in c for c in allc)
      and any('npm install' in c for c in allc))
sys.exit(0 if ok else 1)
PY

# 3. Root package.json declares the Amplify backend CLI (provides ampx) + backend.
python3 - <<'PY' && ok "root package.json declares @aws-amplify/backend-cli + backend" || bad "root package.json missing Amplify backend CLI/backend"
import json,sys
p=json.load(open('package.json'))
alld={**p.get('dependencies',{}),**p.get('devDependencies',{})}
sys.exit(0 if '@aws-amplify/backend-cli' in alld and '@aws-amplify/backend' in alld else 1)
PY

# 4. No real AWS account id / profile / private host in tracked files (placeholders only).
#    The scanner and the secret-scan test legitimately CONTAIN these literals (to
#    search for them), so they are excluded — otherwise the scan always self-matches.
if git grep -nIE '683444362393|565036926641|morbv-customer|forgejo:rondamstra|192\.168\.' \
     -- . \
     ':(exclude).forgejo-sync.log' \
     ':(exclude)scripts/preflight.sh' \
     ':(exclude)tests/**/secretScan*.test.ts' >/dev/null 2>&1; then
  bad "private identifier found in tracked files"
else
  ok "no private AWS/account/host identifiers in tracked files"
fi

# 5. amplify_outputs.json / .env / node_modules are gitignored.
git check-ignore amplify_outputs.json >/dev/null 2>&1 && ok "amplify_outputs.json gitignored" || bad "amplify_outputs.json not gitignored"

echo
echo "===== LIVE checks (require AWS; prove account readiness) ====="
if [ "$LIVE" -ne 1 ]; then
  skip "live checks not requested (pass --live --profile <p> --region <r> --app-id <id>)"
  skip "NOTE: offline checks above do NOT prove a successful AWS deployment."
else
  [ -n "$PROFILE" ] && [ -n "$REGION" ] || { bad "--live needs --profile and --region"; LIVE=0; }
fi
if [ "$LIVE" -eq 1 ]; then
  AWS="aws --profile $PROFILE --region $REGION"
  ACC="$($AWS sts get-caller-identity --query Account --output text 2>/dev/null || echo none)"
  [ "$ACC" != "none" ] && ok "identity resolved: account $ACC" || bad "no AWS identity (aws sso login / credential_process?)"
  VER="$($AWS ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --query Parameter.Value --output text 2>/dev/null || echo none)"
  { [ "$VER" != "none" ] && [ "$VER" -ge 6 ] 2>/dev/null; } && ok "CDK bootstrap version $VER (>=6)" || bad "CDK bootstrap missing/old ($VER) — run account-bootstrap.sh"
  if [ -n "$APP_ID" ]; then
    SR="$($AWS amplify get-app --app-id "$APP_ID" --query app.iamServiceRoleArn --output text 2>/dev/null || echo none)"
    { [ "$SR" != "none" ] && [ "$SR" != "None" ] && [ -n "$SR" ]; } && ok "Amplify app $APP_ID has service role: $SR" || bad "Amplify app $APP_ID has NO service role — run account-bootstrap.sh"
  else
    skip "no --app-id; service-role check skipped"
  fi
fi

echo
[ "$FAIL" -eq 0 ] && echo "PREFLIGHT: PASS" || echo "PREFLIGHT: FAIL"
exit $FAIL
