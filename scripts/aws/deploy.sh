#!/usr/bin/env bash
set -euo pipefail

TF_DIR="${TF_DIR:-infra/aws}"
REGION="${AWS_REGION:-$(terraform -chdir="$TF_DIR" output -raw aws_region)}"
CLUSTER=$(terraform -chdir="$TF_DIR" output -raw ecs_cluster)
SUBNETS=$(terraform -chdir="$TF_DIR" output -json private_subnets | jq -r 'join(",")')
SG=$(terraform -chdir="$TF_DIR" output -raw ecs_security_group)
TASKS=$(terraform -chdir="$TF_DIR" output -json release_task_definitions)
APP_SECRET=$(terraform -chdir="$TF_DIR" output -raw application_secret_arn)
RELEASE_LOG=$(terraform -chdir="$TF_DIR" output -raw release_log_group)
NETWORK="awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}"

run_task() {
  local name="$1" definition="$2"
  echo "Running $name..."
  local arn id exit_code
  arn=$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" \
    --launch-type FARGATE --task-definition "$definition" --network-configuration "$NETWORK" \
    --query 'tasks[0].taskArn' --output text)
  [[ "$arn" != "None" ]] || { echo "failed to launch $name" >&2; exit 1; }
  aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$arn"
  exit_code=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$arn" \
    --query 'tasks[0].containers[0].exitCode' --output text)
  if [[ "$exit_code" != "0" ]]; then
    aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$arn" --output json >&2
    exit 1
  fi
  id="${arn##*/}"
  LAST_TASK_ID="$id"
}

run_task node-migrate "$(jq -r .node_migrate <<<"$TASKS")"
run_task chat-migrate "$(jq -r .chat_migrate <<<"$TASKS")"
run_task chat-backfill "$(jq -r .chat_backfill <<<"$TASKS")"

secret_json=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$APP_SECRET" --query SecretString --output text)
current_token=$(jq -r '.CALYX_MGMT_TOKEN // ""' <<<"$secret_json")
if [[ "$current_token" == calyx_mgmt_bootstrap-* || -z "$current_token" ]]; then
  run_task mgmt-bootstrap "$(jq -r .mgmt_bootstrap <<<"$TASKS")"
  sleep 3
  log_stream="mgmt-bootstrap/bootstrap/$LAST_TASK_ID"
  logs=$(aws logs get-log-events --region "$REGION" --log-group-name "$RELEASE_LOG" \
    --log-stream-name "$log_stream" --query 'events[].message' --output text)
  token=$(grep -o 'calyx_mgmt_[A-Za-z0-9_-]*' <<<"$logs" | head -1)
  [[ -n "$token" ]] || { echo "management token missing from bootstrap logs" >&2; exit 1; }
  updated=$(jq --arg token "$token" '.CALYX_MGMT_TOKEN=$token' <<<"$secret_json")
  aws secretsmanager put-secret-value --region "$REGION" --secret-id "$APP_SECRET" --secret-string "$updated" >/dev/null
fi

terraform -chdir="$TF_DIR" apply -var='release_ready=true'
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" \
  --services intake consumer detector mcp chat web $(terraform -chdir="$TF_DIR" output -json 2>/dev/null | jq -r 'if .slack_enabled?.value then "slack" else empty end')

urls=$(terraform -chdir="$TF_DIR" output -json urls)
curl --fail --retry 12 --retry-delay 5 "$(jq -r .intake <<<"$urls")/ready"
curl --fail --retry 12 --retry-delay 5 "$(jq -r .chat <<<"$urls")/ready"
curl --fail --retry 12 --retry-delay 5 "$(jq -r .mcp <<<"$urls" | sed 's#/mcp$##')/health"
curl --fail --retry 12 --retry-delay 5 "$(jq -r .web <<<"$urls")/"
echo "AWS deployment is ready."
