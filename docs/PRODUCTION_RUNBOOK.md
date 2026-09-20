# Production deployment and recovery runbook

## Release invariants

- Build Node and Go images from the same reviewed commit and deploy immutable `@sha256:` references.
- PostgreSQL, Redis, and R2 are private managed services. Database and Redis transport encryption is mandatory unless an explicitly attested private network provides it.
- TLS terminates before the three public origins: web, chat API, and intake/MCP. Only the reverse proxy/load balancer can reach container ports.
- Run migrations and upload backfill before API replicas. Never edit an applied migration.
- Keep the previous image digests available for rollback.

## Build and publish

```bash
docker build -t "$REGISTRY/calyx-node:$GIT_SHA" .
docker build -t "$REGISTRY/calyx-chat:$GIT_SHA" ./apps/api
docker push "$REGISTRY/calyx-node:$GIT_SHA"
docker push "$REGISTRY/calyx-chat:$GIT_SHA"
docker buildx imagetools inspect "$REGISTRY/calyx-node:$GIT_SHA"
docker buildx imagetools inspect "$REGISTRY/calyx-chat:$GIT_SHA"
```

Copy each manifest digest into `CALYX_NODE_IMAGE` and `CALYX_CHAT_IMAGE`. Copy `deploy/.env.production.example` to a secret-managed location outside the repository and fill every value.

## Provisioning

1. Create PostgreSQL with automated backups and point-in-time recovery.
2. Create Redis with authentication, TLS, persistence appropriate for stream ingestion, and eviction disabled for Calyx keys.
3. Create a private R2 bucket and a bucket-scoped object read/write credential.
4. Register HTTPS origins and certificates.
5. Configure the external OAuth issuer, introspection client, and `MCP_PUBLIC_URL` audience.
6. Configure the GitHub App setup URL as `https://<intake>/v1/github/install/callback` and grant Contents read/write, Pull requests read/write, Webhooks read/write, and Metadata read.
7. Configure Slack credentials and explicit remediation approver IDs.
8. Configure the HTTPS coding-agent dispatcher and customer remediation operator.

## Deploy

```bash
./scripts/deploy-production.sh /secure/path/calyx.production.env
```

The script fails before deployment when secrets, TLS URLs, OAuth, immutable image digests, or integration configuration are missing. Compose runs Node and Go migrations, upload backfill, then starts services and probes readiness.

Deploy `apps/web` with the same web variables after backend readiness succeeds. Do not put `CALYX_INTERNAL_API_KEY`, `CALYX_MGMT_TOKEN`, OAuth client secrets, R2 credentials, or GitHub keys in `NEXT_PUBLIC_*` variables.

## End-to-end acceptance

Use a dedicated acceptance tenant and repository:

1. Register through the web app and create a workspace.
2. Create a project and verify the immutable workspace/tenant link.
3. Install the GitHub App through the Control Center and confirm the repository webhook.
4. Create a telemetry source, ingest a signed event, and confirm consumer persistence.
5. Trigger a detector incident and verify durable Slack delivery.
6. Investigate the same incident from web, Slack, and hosted MCP; confirm evidence IDs agree.
7. Upload and read an image, then delete its message and confirm the object deletion queue drains.
8. Propose remediation, reject once, propose again, approve with an allowlisted actor, and verify immutable events and single execution.
9. Launch a coding job and verify a job-specific branch and draft PR; confirm no merge occurs.
10. Connect two chat API replicas, write through one, and verify a WebSocket connected to the other receives the event.

## Recovery drills

### PostgreSQL restore

- Restore the latest backup into an isolated database.
- Run Node migration, `calyx-migrate`, and `calyx-backfill-uploads` against the restored database.
- Verify migration checksums, tenant links, incidents, remediation events, coding jobs, and upload metadata.
- Point isolated services at the restored database and execute read-only acceptance checks before promotion.

### Redis loss

- Expect temporary realtime and ingestion-stream interruption; PostgreSQL data remains authoritative.
- Restore/recreate Redis, restart consumer and Go replicas, then verify consumer-group creation and cross-replica realtime.
- Re-submit only telemetry known not to have received a successful ingestion response. Never infer replay from ambiguous external remediation or coding side effects.

### R2 outage

- Upload/read readiness fails while chat text remains durable in PostgreSQL.
- Object deletion intents remain in `chat_object_deletions` and retry after recovery.
- Never delete queue rows manually without confirming the corresponding object is absent.

### Ambiguous external side effects

- Remediation left `executing`: reconcile with the customer operator using request ID; do not replay automatically.
- Coding job left `submitting`: inspect the job branch/PR and reconcile by job ID; do not create another PR blindly.

## Rollback

1. Stop new writes if the release introduced data-shape incompatibility.
2. Roll services back to previous immutable image digests.
3. Do not reverse a migration by editing migration history. Add a reviewed forward repair migration.
4. Confirm `/ready`, then repeat acceptance checks for authentication, tenant isolation, ingestion, chat, MCP, remediation, and coding jobs.

## Monitoring and ownership

Alert on readiness failure, HTTP 5xx rate, consumer lag, detector failures, Slack/remediation delivery backlog, coding jobs stuck in active states, `chat_object_deletions` age/attempts, PostgreSQL saturation, Redis memory/evictions, and R2 errors. Assign an on-call owner and link alerts to this runbook before launch.
