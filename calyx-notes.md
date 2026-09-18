# Calyx — Build notes

How we ship Act I (Observe and explain) then Act II (infra control). Each stage: what to build, how to know it works, what must stay true so the next stage does not require a rewrite.

The high-level path lives in [`README.md`](./README.md). This file is the working checklist.

**Meta-rule:** one `src/schemas/` package (`Event`, `Anomaly`, `Alert`, `Tool`, `Action`). Every layer imports it. Slack / CLI / MCP are adapters. Detectors emit anomalies; they never post to Slack. Actions always go through policy.

---

## Status of the original six phases

These were the foundation. Treat them as **done as skeleton**, not as product.

| Phase | Skeleton | Product gap |
|---|---|---|
| 1 Ingestion + storage | `/v1/logs`, Redis, Postgres, `tenant_id`, open `attributes` | Projects/environments; more source types |
| 2 Tool-using agent | Registry + loop; 3 tools | Golden question set; more intents |
| 3 Slack | Adapter, card template, charts, threads, approval UI | Detection does not post investigated cards yet |
| 4 Detection | Error-rate detector + in-memory dedup | Only one detector; not wired to dispatch |
| 5 MCP + CLI | Thin wrappers | No tail / thread search / connect |
| 6 Execution | `Action` + tiers + audit + flag-toggle stub | No real operator or Slack-gated live action |

Do not rebuild these. Close Stage 1 on top of them.

---

## Act I — Observe and explain

### Stage 1 — Close the live loop  ← current

**Build:** A dispatcher that (1) runs detectors on a schedule, (2) skips if dedup says the anomaly is still the same one, (3) calls the agent to fill `Alert` (impact, root cause, recommended action) from recent logs + stats, (4) posts `buildAlertCard` to Slack, (5) stores `channel` + `thread_ts` so replies stay on that incident.

**Validate:**

- Synthetic error spike → exactly one Slack card.
- Same spike still present next cycle → no second card.
- Reply in thread “when did this start?” → answer uses that service’s logs, not a blank channel mention.
- Card always has the four fields, even if the model is uncertain (say so in root cause; do not omit the section).

**Foundation:** Alert is a schema object. Slack only renders it. Persistence of alert + thread mapping is what Stage 4 memory will query.

### Stage 2 — Conversational debugging

**Build:** Golden set of ~15 questions on seeded data (errors, “what changed” with *no* deploy data yet, blast radius from log attributes, “is X healthy?”, empty-data case). Render `visualization_hint` (table / timeseries / bar / diagram / none). Keep thread history in the agent context. First diagram type: causal **chain** (see Visualizations).

**Validate:** Regression of the golden set on every agent change. Empty data → “no matching events”, never a hallucinated outage. Two users in one thread both get attributed replies.

**Foundation:** New tools register once and appear in Slack, CLI, and MCP.

### Stage 3 — More detectors

**Build:** `silent_failure` first (service that usually emits and went quiet). Then `latency_degradation` if `duration_ms` (or similar) exists in `attributes`. Leave frustrated-users and cost until those event types exist. Failed deploys wait for Stage 6 signals.

**Validate:** Known-quiet window fires; normal low-traffic night does not (need a baseline of “this service usually logs N/min”). Persisting silence does not spam.

**Foundation:** Same `Anomaly` shape. Dispatcher from Stage 1 unchanged.

### Stage 4 — Memory

**Build:** `incidents` (or alerts) table: tenant, service, type, status, card fields, slack thread, timestamps, resolution notes. `search_past_incidents` reads this, not only keyword-scanning logs. On resolve, write “what we did.”

**Validate:** Fire spike A, resolve it, fire a similar spike B → card or thread cites A. Search CLI/MCP returns A.

**Foundation:** This is also the audit trail for Act II (“we restarted X last time”).

### Stage 5 — CLI / MCP parity

**Build:**

```
calyx ask "<question>" --tenant …          # exists as `ask`
calyx logs query …                         # exists as `logs`
calyx logs tail --tenant … [--service]
calyx threads search "<keywords>"
calyx tools
```

MCP: run from Cursor against seeded tenant; tools list matches registry.

**Validate:** Scripted smoke tests, exit codes, `--json`. MCP `investigate` path returns structured summary + data.

**Foundation:** Still zero tool logic in the CLI/MCP files.

### Stage 6 — Signals (deploys / commits)

**Build:** Ingest GitHub (or generic) deploy/commit events as the same `Event` with `service` + attributes (`sha`, `version`, `actor`). Tool: `get_deploy_history`. Detector/agent may correlate error spikes to the last deploy.

**Validate:** Seed a deploy then an error spike → root cause mentions the version/sha. No deploy in window → agent says so.

**Foundation:** Still one events table. No “deploys” microservice.

### Stage 7 — Code search + PR handoff

**Build:** GitHub App read access → `search_code`. Optional: Slack button / phrase launches a cloud coding agent and posts the PR URL into the thread. Human merges. Do not auto-merge.

**Validate:** Known function name in a fixture repo is found. Handoff is opt-in and logged.

**Foundation:** Handoff is an `Action` (Tier 0) even if it only opens a PR — same policy/audit as infra later.

---

## Act II — Infrastructure control

Do not start until Stage 1 cards are trusted on real (or realistic) traffic.

### Stage 8 — Slack-gated flag toggle

**Build:** Connect existing `flag-toggle` action to a real or fake flag backend. Alert recommended action can include `action_name` + params. Slack “Run it” sets `human_approved`. Undo button.

**Validate:** Dry-run always happens. Without click, nothing executes. Audit has before/after. Undo restores. Wrong action in sandbox is blocked by Tier 0.

### Stage 9 — Customer operator

**Build:** Operator process in Docker/K8s on the *user* side. Brain sends signed commands; operator holds provider credentials. Calyx SaaS never stores cloud keys.

**Validate:** Kill network to the flag SaaS from the brain — execute still works via operator. Stolen brain DB has no AWS keys.

### Stage 10 — Kubernetes

**Build:** Actions: restart pod/workload, scale, rollback ReplicaSet. Default Tier 0. `reversible` true for scale/rollback.

**Validate:** Staging cluster only. Undo scale. Policy refuses unnamed namespaces / `prod-critical` labels.

### Stage 11 — CI/CD

**Build:** GitHub Actions `workflow_dispatch`, cancel, re-run. Same Action interface.

**Validate:** Dry-run shows which workflow/ref. Execute from Slack is human-gated.

### Stage 12 — Deploy rollback

**Build:** One platform (pick whatever you actually use: Railway / Render / Fly / Vercel). Rollback + list previous deploys.

**Validate:** Staging project rolls back and forward (undo).

### Stage 13 — VMs

**Build:** Last. Start/stop/resize with tag allowlists and min/max size in policy.

**Validate:** Cannot touch untagged instances. Cannot exceed bounds even if the model asks.

**Promotion rule:** an action type stays Tier 0 until you have a run of correct suggestions. Then one named playbook may move to Tier 1 (config, not hardcoded).

---

## Intentionally later / never (for now)

- Web dashboard — only if Slack cannot do the job.
- Frustrated-user and cost detectors — need those event types first.
- PagerDuty / incident.io — after Slack loop is daily-driver.
- ClickHouse, Kafka, Temporal — when Postgres + cron + Redis actually hurt.
- GraphQL, SSO, SOC2 — when there is a second tenant who cares.
- Auto-merge of agent PRs, Tier 2 on VMs — maybe never.

---

## Visualizations (charts vs diagrams)

’s “dynamic visualizations” are not a dashboard and not a drawing app. After investigating, the agent picks **one** visual that matches the question, then Slack/CLI/MCP render it. Share = send the thread.

| Kind | Question it answers | Calyx today | How we build it |
|---|---|---|---|
| **Table / status bars** | Who / how many / which service | Slack fields + text bars | Keep |
| **Chart (PNG)** | Latency, error rate, volume over time | Chart.js → `files.upload` | Keep; `autoChartType` from hint + data shape |
| **Diagram** | How did this fail *across* services? | Missing | Structured graph → renderer. Not mermaid-in-Slack (Slack will not draw it). |

**Rule:** the model never picks a Chart.js type and never uploads pixels. Tools return `data` + `visualization_hint`. The Slack adapter already does this for charts; diagrams join the same `ChartResult` (`image` and/or `blocks` + `caption`).

**Diagram payload** (add `diagram` to `visualization_hint` when the first renderer lands):

```ts
{
  kind: "chain" | "graph" | "sequence",
  title?: string,
  nodes: { id: string; label: string; status?: "ok" | "warn" | "error" }[],
  edges: { from: string; to: string; label?: string }[]
}
```

**Kinds we actually need**:

1. **Chain** — “traced the failure across 4 services.” Vertical Block Kit flow (emoji + arrows). No extra deps. Ship with Stage 2 / `trace_request`.
2. **Sequence** — one request hopping services (`trace_id`). Same payload, later a PNG if Block Kit is too cramped.
3. **Graph** — service map / who-calls-whom. Only after we have call or deploy edges, not guessed from names.
4. **Mermaid → PNG** — optional later if a browser renderer is worth the weight. Do not paste mermaid source into Slack as the product.

**Do not:** let the LLM freehand SVG; add draw.io; or build a web canvas. If the visual is “numbers over time,” it is a chart. If it is “A caused B caused C,” it is a chain diagram.

---

## Schema additions to expect (additive)

| When | Add |
|---|---|
| Stage 1 | Persist `Alert`; map to Slack thread |
| Stage 3 | Use existing `AnomalyType` values; do not fork a second enum |
| Stage 4 | Incident/resolution fields |
| Stage 6 | No new event type — deploys are events with attributes |
| Stage 8+ | Nothing new on `Action` if `dry_run` / `execute` / `undo` / `defaultTier` already hold |
