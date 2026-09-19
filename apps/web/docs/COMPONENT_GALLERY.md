# Calyx utility · GitHub · cloud gallery

Living checklist. When a component ships, a sample message is posted to `#calyx-utilities` and the item is marked done.

**Channel:** `#calyx-utilities` (`jx77ktpdxnqnjjnf4j7d3hyxj18end6w`)  
**Seed:** `pnpm exec convex run gallery:seedUtilityGallery '{"workspaceId":"…"}'`  
**Components:** `apps/web/src/components/calyx/charts/{utility,github,cloud}-cards.tsx`

---

## Shared primitives

- [x] `action-card` — title · why · risk · Dry-run / Run / Undo
- [x] `data-table` — sortable top-N table attachment
- [x] `metric-chips` — status / metric / time-range / source badges
- [x] `diff-card` — before/after config or flag diff

## Starter pack (simple apps)

- [x] `uptime-pulse` — site up? + 24h strip
- [x] `error-digest` — plain-language top errors
- [x] `slow-pages` — p95 by route bars
- [x] `user-pain-feed` — users hit errors recently
- [x] `feature-flags` — flag state + last flip
- [x] `release-notes` — what shipped
- [x] `queue-backlog` — failed / oldest jobs
- [x] `db-basics` — connections / slow queries / migrations
- [x] `auth-hiccups` — failed logins / OAuth errors
- [x] `email-deliverability` — bounce / provider
- [x] `morning-digest` — overnight summary card
- [x] `incident-lite` — severity · owner · checklist
- [x] `runbook-checklist` — in-thread playbook steps
- [x] `progress-indicator` — percent · delta vs last period · tick bar

## GitHub

- [x] `pr-risk` — files, size, sensitive paths, CI
- [x] `ci-failure` — failing job + log snippet + flake vs real
- [x] `deploy-from-commit` — commit → env → merger
- [x] `blame-hotspot` — file ↔ incident count
- [x] `dependency-alert` — CVE / Dependabot
- [x] `release-train` — blocking PRs + checks
- [x] `workflow-strip` — queued → running → failed
- [x] `pr-chip` — compact PR identity chip row
- [x] `pr-unfurl` — PR title · truncated summary · diffstat · comments

## Cloud (shared)

- [x] `resource-health` — service + region status
- [x] `quota-warning` — approaching limits
- [x] `cost-anomaly-lite` — WoW spend spike
- [x] `iam-risk` — key age / public bucket / open SG
- [x] `outage-overlay` — provider status × your errors

## AWS

- [x] `aws-lambda-health` — errors / throttles / cold starts
- [x] `aws-alb-5xx` — ALB 5xx + unhealthy targets
- [x] `aws-rds-basics` — CPU / connections / storage
- [x] `aws-sqs-dlq` — DLQ depth
- [x] `aws-ecs-desired` — desired vs running

## Azure

- [x] `azure-app-failures` — App Service / Functions
- [x] `azure-aks-restarts` — pod restart strip
- [x] `azure-servicebus-dlq` — DLQ depth
- [x] `azure-entra-auth` — Entra ID auth failures

## GCP

- [x] `gcp-cloud-run` — error rate by revision
- [x] `gcp-cloud-sql` — basics
- [x] `gcp-pubsub-unacked` — unacked messages
- [x] `gcp-error-reporting` — top Error Reporting issues
- [x] `gcp-cloud-build` — build failure card

## Progress

| Done | Total |
|------|-------|
| 44   | 44    |

_Last updated: all components built + seeded to `#calyx-utilities`_
