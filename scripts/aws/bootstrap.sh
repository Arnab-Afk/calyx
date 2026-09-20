#!/usr/bin/env bash
set -euo pipefail

TF_DIR="${TF_DIR:-infra/aws}"
[[ -f "$TF_DIR/terraform.tfvars" ]] || {
  echo "copy $TF_DIR/terraform.tfvars.example to terraform.tfvars and fill all values" >&2
  exit 1
}
command -v aws >/dev/null
command -v terraform >/dev/null
command -v docker >/dev/null
command -v jq >/dev/null

terraform -chdir="$TF_DIR" init
terraform -chdir="$TF_DIR" fmt -check
terraform -chdir="$TF_DIR" validate
terraform -chdir="$TF_DIR" apply \
  -target='aws_ecr_repository.image["node"]' \
  -target='aws_ecr_repository.image["chat"]' \
  -target='aws_ecr_repository.image["web"]'

export AWS_REGION=$(terraform -chdir="$TF_DIR" output -raw aws_region)
export DOMAIN_NAME=$(terraform -chdir="$TF_DIR" console <<<"var.domain_name" | tr -d '"')
./scripts/aws/push-images.sh
terraform -chdir="$TF_DIR" apply -var='release_ready=false'
./scripts/aws/deploy.sh
