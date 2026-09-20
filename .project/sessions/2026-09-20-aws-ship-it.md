# AWS Ship It deployment

**Date:** 2026-09-20

## Built

- Terraform for a two-AZ VPC, public ALB subnets, private ECS/data subnets, and cost-optimized NAT.
- ECR repositories and digest-pinned ECS Fargate tasks for web, intake, consumer, detector, MCP, chat, and optional Slack.
- Private RDS PostgreSQL, encrypted TLS/authenticated ElastiCache Redis, and private encrypted/versioned S3 uploads.
- ECS task-role S3 access; Go no longer needs static AWS keys on ECS.
- ACM certificate validation, Route 53 aliases, and ALB host routing for app/chat/intake/MCP URLs.
- Secrets Manager separation for generated infrastructure credentials and external provider credentials.
- One-off ECS tasks for Node migrations, Go migrations, upload backfill, and management-token bootstrap.
- CloudWatch Logs, Container Insights, dashboard, alarms, SNS, and optional recursive-safe CloudWatch-to-Calyx forwarding Lambda.
- Standalone Next.js AWS image with public endpoints baked at build time.
- Bootstrap, image push, release, and public smoke scripts.
- CI Terraform format/init/validate and web image build gates.

## Verification

- Terraform formatting and provider-backed validation pass.
- Go IAM object-storage configuration test added.
- Production preflight supports ECS task-role mode.
- Actual plan/apply and public recovery drills require AWS credentials and DNS/provider configuration.
