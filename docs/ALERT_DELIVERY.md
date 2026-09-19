# Scheduled detection and Slack alert delivery

The detector process scans tenant/service pairs that received events recently, records anomalies as durable alert/incident context, and delivers each alert through a PostgreSQL outbox.

## Run locally

```bash
docker compose up -d postgres redis
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx npm run migrate
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
SLACK_BOT_TOKEN=xoxb-... \
CALYX_SLACK_ALERT_CHANNELS='{"default":"C0123456789"}' \
npm run dev:detector
```

Docker users can run `docker compose --profile slack up --build` to start both the Slack interaction service and detector, or `--profile detector` for the detector alone.

## Configuration

- `CALYX_DETECTION_INTERVAL_MS` — cycle interval; defaults to 60 seconds.
- `CALYX_ACTIVE_SERVICE_LOOKBACK_HOURS` — only scan services with recent events; defaults to 24 hours.
- `CALYX_SLACK_ALERT_CHANNELS` — JSON object mapping exact tenant IDs to Slack channel IDs. Use this for multi-tenant deployments.
- `CALYX_SLACK_ALERT_CHANNEL` — single-tenant fallback. It is used only when the event tenant exactly matches `CALYX_TENANT_ID`.

Never configure one fallback channel for unrelated tenants. Delivery records include the authenticated tenant, alert ID, destination, and target.

## Delivery behavior

- Repeated detections update the active alert and incident but do not enqueue duplicate messages for the same alert/channel.
- Workers claim due deliveries with `FOR UPDATE SKIP LOCKED`.
- Failures use exponential backoff and stop being claimed after five attempts.
- Processing leases older than five minutes are recovered after a worker crash.
- Successful Slack timestamps are stored as external delivery IDs.
- Slack acknowledge/resolve actions are accepted only from the channel that received the durable delivery.
- Acknowledgement moves the linked incident to `investigating`; resolution updates both the alert and incident transactionally, including actor, timestamp, and resolution notes.

Web delivery is represented in the outbox contract but is not enabled until an authenticated workspace notification target exists.
