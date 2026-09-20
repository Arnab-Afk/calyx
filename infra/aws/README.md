# Calyx AWS Ship It deployment

This stack deploys the complete application on AWS:

- ECR repositories and immutable images
- ECS Fargate for web, intake, consumer, detector, hosted MCP, Go chat, and optional Slack
- RDS PostgreSQL and TLS/authenticated ElastiCache Redis in private subnets
- private, encrypted, versioned S3 upload storage accessed through the ECS task IAM role
- public ALB with ACM TLS and Route 53 host routing
- Secrets Manager for infrastructure and provider credentials
- CloudWatch Logs, Container Insights, dashboard, alarms, and optional Calyx log-forwarding Lambda
- one-off ECS tasks for Node migrations, Go migrations, upload backfill, and management-token bootstrap

## Prerequisites

AWS CLI credentials, Terraform 1.7+, Docker Buildx, and `jq`. The Route 53 hosted zone must already exist. For a hackathon-cost deployment the default uses one NAT gateway, one RDS instance, and one Redis node across two private subnets.

Use an encrypted remote Terraform backend for a team deployment because generated database, Redis, JWT, and internal credentials exist in Terraform state. Never commit `terraform.tfvars`, state, or `images.auto.tfvars`.

## Fast deployment

```bash
cp infra/aws/terraform.tfvars.example infra/aws/terraform.tfvars
# Fill domain, zone, external OAuth, GitHub, AI, coding-agent, and optional Slack values.

aws sts get-caller-identity
./scripts/aws/bootstrap.sh
```

`bootstrap.sh`:

1. creates ECR repositories;
2. builds and pushes digest-pinned Node, Go, and Next.js images;
3. provisions infrastructure with services held at zero;
4. runs all migration/backfill tasks;
5. creates the initial management token and rotates the Secrets Manager value;
6. enables ECS services and waits for stability;
7. probes all public HTTPS endpoints.

Public URLs are:

- `https://app.<domain>`
- `https://chat.<domain>`
- `https://intake.<domain>`
- `https://mcp.<domain>/mcp`

## OAuth

Calyx hosted MCP requires an RFC 7662 introspection endpoint. You may use an existing issuer or place a small token-introspection adapter in front of Cognito. Populate the issuer, introspection URL, client ID, and secret in `application_secrets`; tenant identity must come from the trusted introspection result.

## CloudWatch → Calyx

After the initial deployment, create a CloudWatch source in the Calyx Control Center. Put its drain URL and one-time token into:

```hcl
cloudwatch_ingestion_enabled = true
cloudwatch_drain_url          = "https://intake.<domain>/v1/drains/cloudwatch/<source-id>"
cloudwatch_source_token       = "calyx_src_..."
```

Apply again. Terraform creates a least-privilege Lambda, stores the source token in Secrets Manager, and subscribes every ECS service log group. The Lambda sends standard CloudWatch subscription envelopes to Calyx.

## Release updates

```bash
export DOMAIN_NAME=example.com
./scripts/aws/push-images.sh
terraform -chdir=infra/aws apply -var='release_ready=false'
./scripts/aws/deploy.sh
```

Services remain at zero during the release gate and start only after migrations/backfill succeed. ECS deployment circuit breakers roll back unhealthy task revisions.

## Cost and teardown

NAT Gateway, RDS, ElastiCache, ALB, and Fargate incur hourly charges. Destroy promptly after judging if the environment is temporary:

```bash
terraform -chdir=infra/aws destroy
```

The S3 bucket has `force_destroy = false`; remove retained uploads deliberately before destruction.
