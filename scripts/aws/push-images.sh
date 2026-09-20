#!/usr/bin/env bash
set -euo pipefail

TF_DIR="${TF_DIR:-infra/aws}"
REGION="${AWS_REGION:-$(terraform -chdir="$TF_DIR" output -raw aws_region 2>/dev/null || echo us-east-1)}"
DOMAIN="${DOMAIN_NAME:?set DOMAIN_NAME to the Terraform domain_name}"
TAG="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"

repos_json=$(terraform -chdir="$TF_DIR" output -json ecr_repositories)
node_repo=$(jq -r .node <<<"$repos_json")
chat_repo=$(jq -r .chat <<<"$repos_json")
web_repo=$(jq -r .web <<<"$repos_json")
registry="${node_repo%%/*}"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$registry"

build_push() {
  local name="$1" repo="$2" dockerfile="$3" context="$4"; shift 4
  docker buildx build --platform linux/amd64 --file "$dockerfile" --tag "$repo:$TAG" --push "$@" "$context" >&2
  aws ecr describe-images --region "$REGION" --repository-name "${repo#*/}" \
    --image-ids imageTag="$TAG" --query 'imageDetails[0].imageDigest' --output text
}

node_digest=$(build_push node "$node_repo" Dockerfile .)
chat_digest=$(build_push chat "$chat_repo" apps/api/Dockerfile apps/api)
web_digest=$(build_push web "$web_repo" apps/web/Dockerfile . \
  --build-arg "NEXT_PUBLIC_CALYX_CHAT_URL=https://chat.$DOMAIN" \
  --build-arg "NEXT_PUBLIC_CALYX_MCP_URL=https://mcp.$DOMAIN/mcp")

cat >"$TF_DIR/images.auto.tfvars" <<EOF
node_image_uri = "$node_repo@$node_digest"
chat_image_uri = "$chat_repo@$chat_digest"
web_image_uri  = "$web_repo@$web_digest"
EOF
printf 'Wrote immutable image digests to %s/images.auto.tfvars\n' "$TF_DIR"
