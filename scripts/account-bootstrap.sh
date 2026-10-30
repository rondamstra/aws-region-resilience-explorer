#!/usr/bin/env bash
#
# account-bootstrap.sh — ONE-TIME privileged AWS account bootstrap for
# AWS Region Resilience Explorer (Amplify Gen 2).
#
# Run by an OPERATOR/OWNER with IAM-admin in the target account. This is the
# privileged provisioning step, separate from routine app deployment (which
# Amplify Hosting does on its own once this has run). Kiro Crew's restricted
# principal cannot run this and must not try.
#
# WHERE TO RUN IT (security): execute this from a SEPARATE, trusted admin
# machine that holds (or vends, via `aws sso login` / credential_process) the
# IAM-admin credentials. Administrator credentials must NEVER be stored on, or
# copied to, the Kiro Crew VM. The script reads credentials only through the
# AWS CLI `--profile` you pass (the SDK resolves them); it never writes, echoes,
# or persists any credential. Nothing here depends on running on the Kiro Crew
# host — it only needs the AWS CLI, python3, and (for first-time bootstrap) npx.
#
# PRODUCTION SCOPED POLICY CAVEAT: with --managed-admin false the role gets the
# scoped inline policy in infra/amplify-service-role.yaml. That policy is a
# best-effort least-privilege starting point and is NOT yet verified against a
# real end-to-end Amplify Gen 2 deploy — treat it as UNVERIFIED, not
# production-ready, until a live deploy confirms it (see the template header).
#
# It is PARAMETERIZED (no hardcoded account/region/app/profile), IDEMPOTENT
# (safe to rerun — CloudFormation create-or-update; CDK bootstrap is a no-op if
# current), and does three things:
#   1. Ensures CDK bootstrap (version >= 6) exists in the account/region.
#   2. Deploys infra/amplify-service-role.yaml (the Amplify backend deploy role).
#   3. Associates that role with the Amplify app (if --app-id is a real id).
#
# USAGE:
#   scripts/account-bootstrap.sh \
#     --profile <aws_profile> --region <region> \
#     --app-id <amplify_app_id | ""> \
#     [--role-name <name>] [--managed-admin true|false] [--dry-run]
#
# Examples:
#   # TEST account, existing app, broad managed policy for bring-up:
#   scripts/account-bootstrap.sh --profile <your-aws-profile> --region eu-west-1 \
#     --app-id <your-amplify-app-id> --managed-admin true
#   # Fresh account, no app yet (wildcard trust), scoped policy:
#   scripts/account-bootstrap.sh --profile <your-aws-profile> --region eu-west-1 \
#     --app-id "" --managed-admin false

set -euo pipefail

PROFILE="" REGION="" APP_ID="" ROLE_NAME="amplify-backend-deploy-aws-map-it"
MANAGED_ADMIN="true" DRY_RUN=0
STACK_NAME="aws-map-it-amplify-service-role"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$HERE/infra/amplify-service-role.yaml"

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2;;
    --region) REGION="$2"; shift 2;;
    --app-id) APP_ID="$2"; shift 2;;
    --role-name) ROLE_NAME="$2"; shift 2;;
    --managed-admin) MANAGED_ADMIN="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

[ -n "$PROFILE" ] && [ -n "$REGION" ] || { echo "ERROR: --profile and --region are required" >&2; exit 2; }
AWS="aws --profile $PROFILE --region $REGION"

echo "== Pre-flight: confirm identity and account =="
IDENT_JSON="$($AWS sts get-caller-identity --output json)"
ACCOUNT="$(echo "$IDENT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["Account"])')"
echo "  account: $ACCOUNT   region: $REGION   profile: $PROFILE"
echo "  identity: $(echo "$IDENT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["Arn"])')"

# ---- 1. CDK bootstrap (idempotent) -----------------------------------------
echo "== 1. CDK bootstrap check (need version >= 6) =="
BOOTSTRAP_VER="$($AWS ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --query Parameter.Value --output text 2>/dev/null || echo "none")"
if [ "$BOOTSTRAP_VER" = "none" ] || [ "$BOOTSTRAP_VER" -lt 6 ] 2>/dev/null; then
  echo "  bootstrap missing/old (got: $BOOTSTRAP_VER). Run:"
  echo "    npx cdk bootstrap aws://$ACCOUNT/$REGION --profile $PROFILE"
  if [ "$DRY_RUN" -eq 0 ]; then
    npx cdk bootstrap "aws://$ACCOUNT/$REGION" --profile "$PROFILE"
  fi
else
  echo "  bootstrap OK (version $BOOTSTRAP_VER)"
fi

# ---- 2. Deploy the service-role stack (create-or-update = idempotent) -------
echo "== 2. Deploy Amplify backend deploy role (stack: $STACK_NAME) =="
APP_PARAM="${APP_ID:-*}"; [ -z "$APP_ID" ] && APP_PARAM="*"
echo "  template: $TEMPLATE"
echo "  params: AmplifyAppId=$APP_PARAM RoleName=$ROLE_NAME UseAdministratorAccessAmplify=$MANAGED_ADMIN"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "  [dry-run] would run: aws cloudformation deploy --stack-name $STACK_NAME ..."
else
  $AWS cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "$TEMPLATE" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
      AmplifyAppId="$APP_PARAM" \
      RoleName="$ROLE_NAME" \
      UseAdministratorAccessAmplify="$MANAGED_ADMIN"
fi
if [ "$DRY_RUN" -eq 1 ]; then
  # In dry-run the stack is NOT deployed, so its outputs don't exist yet. Do not
  # query them (an empty result would wrongly look like "no role"). Show the ARN
  # the stack WOULD export instead.
  ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME} (dry-run; not yet created)"
  echo "  service role ARN (dry-run, predicted): $ROLE_ARN"
else
  ROLE_ARN="$($AWS cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='ServiceRoleArn'].OutputValue" --output text 2>/dev/null || echo "")"
  echo "  service role ARN: ${ROLE_ARN:-<pending>}"
fi

# ---- 3. Associate the role with the Amplify app -----------------------------
# This step sets ONLY the service role. It NEVER changes the app's hosting
# platform: `update-app` is called with --iam-service-role-arn and nothing else,
# so --platform is never sent and the existing platform is preserved verbatim.
# This app is a STATIC SPA and must stay platform WEB (not WEB_COMPUTE).
#
# Gating keys off --app-id (what the operator supplied), NOT off ROLE_ARN, so
# dry-run with an app id correctly reports the association it WOULD perform
# rather than falsely claiming "no --app-id given".
if [ -n "$APP_ID" ]; then
  echo "== 3. Associate role with Amplify app $APP_ID =="
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] would associate role with app $APP_ID:"
    echo "  [dry-run]   aws amplify update-app --app-id $APP_ID --iam-service-role-arn <ServiceRoleArn>"
    echo "  [dry-run] (platform is NOT part of this call and is left unchanged)"
  else
    [ -n "$ROLE_ARN" ] || { echo "  ERROR: no ServiceRoleArn from stack $STACK_NAME; cannot associate." >&2; exit 1; }
    # Read (never write) the current platform and surface it for the operator.
    CURRENT_PLATFORM="$($AWS amplify get-app --app-id "$APP_ID" --query app.platform --output text 2>/dev/null || echo "unknown")"
    echo "  current app platform: $CURRENT_PLATFORM (this script will NOT change it)"
    if [ "$CURRENT_PLATFORM" = "WEB_COMPUTE" ]; then
      echo "  NOTE: platform is WEB_COMPUTE, but this is a static SPA — WEB is expected."
      echo "        Not changing it automatically. Review/correct in the Amplify console if intended."
    fi
    # Only the service role is set; platform is intentionally omitted.
    $AWS amplify update-app --app-id "$APP_ID" --iam-service-role-arn "$ROLE_ARN" >/dev/null
    SAVED="$($AWS amplify get-app --app-id "$APP_ID" --query app.iamServiceRoleArn --output text)"
    PLATFORM_AFTER="$($AWS amplify get-app --app-id "$APP_ID" --query app.platform --output text)"
    echo "  saved iamServiceRoleArn: $SAVED"
    echo "  platform after (unchanged): $PLATFORM_AFTER"
    [ "$SAVED" = "$ROLE_ARN" ] && echo "  VERIFIED: role associated." || { echo "  ERROR: saved ARN does not match." >&2; exit 1; }
  fi
else
  echo "== 3. Skipped app association (no --app-id given; create the app first, then rerun) =="
fi

# Completion banner is dry-run aware: a dry-run makes NO changes and must not
# imply the bootstrap actually happened.
if [ "$DRY_RUN" -eq 1 ]; then
  echo "== DRY-RUN complete: NO changes were made. Re-run without --dry-run to apply. =="
else
  echo "== Bootstrap complete. Routine deploys now run via Amplify Hosting (ampx pipeline-deploy). =="
fi
