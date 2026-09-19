# Calyx

AI-native observability, then infrastructure control.

**Goal:** autonomous alerts, conversational debugging, coding-agent access — then go further: Calyx can *change* infrastructure (flags, pods, CI/CD, deploys, VMs) behind a hard approval gate.

Act II is Calyx’s own layer. Do not mix them: a wrong read is a wrong answer; a wrong write takes down production.

---

## The loop we are building

```
logs land → detectors watch (no monitor config)
         → LLM investigates (impact / root cause / recommended action)
         → Slack card in the team channel
         → humans (and later coding agents) debug in the thread
         → optional: propose a fix (PR) or an infra action
         → human approves → operator executes in the customer’s network
         → incident + outcome saved as memory
```

People never need a dashboard. Slack, CLI, and MCP are three doors to the **same** tools.

**Philosophy:** chat is the UI; logs are the primitive; static monitors are a failure mode. If a feature needs a threshold config screen, it is off-brief.

---

## Two acts

### Act I — Observe and explain (observe, explain, hand off code)

Three pillars:

| Pillar | What “done” feels like |
|---|---|
| **Autonomous alerts** | Zero setup. Six detector families. A Slack card with severity, status, impact, root cause, recommended action. No spam on a persisting issue. |
| **Conversational debugging** | `@Calyx why is checkout 500ing?` in the thread. Agent picks a chart or table. Several people can swarm the same incident. |
| **Coding agents welcome** | Same tools via CLI + MCP. Skills: investigate-error, check-system-health, trace-request. Later: launch Cursor/Claude to open a PR. |

**Alert card (the core UI object):** title, severity, status (open/resolved), impact, root cause, recommended action, buttons (`Investigate` / `Start an Incident`).

**Detectors (zero-setup):** error spikes → silent failures → slow queries → failed deploys → frustrated users → runaway costs.

**Query intents:** error investigation, change correlation, root cause, blast radius, trends, system diagnostics.

**CLI shape to match:** `calyx ask`, `calyx logs query|tail`, `calyx threads search`, `calyx data-sources connect`, `calyx projects list`.

**Onboarding (v1 shipped):** [`docs/ONBOARDING_CLI.md`](./docs/ONBOARDING_CLI.md) — `calyx login` → `projects` / `sources` / `github connect` / `slack connect` / `onboard`.

Full competitor notes live at the bottom of this file.

### Act II — Infrastructure control (after the loop is trusted)

Calyx’s brain decides *what* should happen. A **customer-side operator** (not Calyx SaaS holding cloud keys) executes it.

```
Calyx brain → approval gate → operator (customer VPC/cluster) → flags / K8s / CI / deploys / VMs
```

| Tier | Behavior |
|---|---|
| **0 — suggest only** | Propose in Slack, human clicks Run. Default for anything risky. |
| **1 — playbooks** | Customer opts into specific reversible actions (restart pod on OOM, rollback if error rate spikes after a deploy). |
| **2 — bounded autonomy** | Auto inside hard limits (scale 2–10, never touch `prod-critical`). |

Every action: `dry_run` → policy → `execute` → immutable audit → `undo` if reversible.

**Risk order (do not skip ahead):** feature flags → pod restart/scale → CI/CD triggers → deploy rollback → VM start/stop/resize.

---

## Where the repo is today

The **skeleton** of both acts exists. The **product loop is not closed**.

| Layer | In the repo | Still missing for a real demo |
|---|---|---|
| Ingestion | `POST /v1/logs`, Redis stream, Loki forwarder | Broader formats, projects/envs as first-class |
| Storage | Postgres events (`tenant_id` on every row) | Incident store, thread memory, ClickHouse later |
| Agent | Claude + `query_logs`, `get_service_stats`, `search_past_incidents` | Change correlation, blast radius, code search, request trace |
| Detection | Error-rate stddev detector, dedup helper | Wire to Slack; silent-failure and the rest of the six |
| Slack | Adapter, alert card, charts, thread replies, approval modal | Detector → investigated card posting; status; Start Incident |
| CLI / MCP | Scoped stdio + authenticated Streamable HTTP connectors over the same tools, including live `tail_logs`; **CLI onboard** for projects / log sources / GitHub / Slack | Incident tools, OAuth, published logger SDK |
| Execution | Action interface, policy tiers, audit log, flag-toggle stub | Real operator, real integrations, Slack “Run it” on live alerts |

Shared contracts live in `src/schemas/` (`Event`, `Anomaly`, `Alert`, `Tool`, `Action`). New detectors, tools, and transports stay additive. Do not invent a second shape per layer.

---

## Path

Build in this order. Each stage has a **demo you can feel**, not just passing tests. Rough sizing assumes one person shipping on the existing codebase.

### Act I — close the observe loop

| Stage | Focus | Demo when done | Size |
|---|---|---|---|
| **1. Close the live loop** | Detection run → LLM writes impact/root cause/action → post Slack card → replies in that thread use the agent | Inject an error spike, get a real card, ask “when did this start?” in-thread | **Now** (1–2 weeks) |
| **2. Conversational debugging** | Golden questions; charts from `visualization_hint`; first **chain diagram** (failure across services) as Slack blocks | “What’s broken?”, “who is affected?”, “why are webhooks failing?” shows a causal chain | 1–2 weeks |
| **3. More detectors** | Silent failure (absence of expected events), then slow queries from log attributes | Stop a worker; Calyx pages “nothing is flowing” without a threshold | 1–2 weeks |
| **4. Memory** | Persist alerts, Slack thread ids, resolutions; `search_past_incidents` hits real history | Second similar spike cites the first incident | 1 week |
| **5. CLI / MCP parity** | `ask`, `logs query/tail`, `threads search`; MCP used from Cursor against seeded data | Coding agent investigates without opening Slack | 1 week |
| **6. Signals** | Ingest deploys/commits as events (GitHub webhooks). Correlate “what changed?” | Alert names the deploy, not just the error rate | 1–2 weeks |
| **7. Code + agent handoff** | `search_code` via GitHub App; optional “open a PR” via Cursor/Claude cloud agent | Thread: “increase the timeout” → PR link | After 1–6 |

Skip frustrated-users and cost detectors until you have those signals. Skip a web dashboard indefinitely unless Slack/CLI are actually used.

### Act II — let it change infrastructure

Start only when Stage 1 alerts are trusted (low false positives, humans click through).

| Stage | Focus | Demo when done |
|---|---|---|
| **8. Slack-gated flag toggle** | Wire existing Action + approval modal to a real flag API (or a fake in-cluster flag). Always Tier 0. | Card says “disable `new-checkout`”; human runs it; audit row exists; undo works |
| **9. Customer operator** | Tiny process in the user’s network; brain sends commands, operator holds creds | Same flag toggle, credentials never in Calyx’s env |
| **10. Kubernetes** | Restart pod, scale deployment, rollback ReplicaSet — still Tier 0 | OOM loop → “restart payments-worker?” → Run |
| **11. CI/CD** | GitHub Actions `workflow_dispatch` / re-run failed job | “re-run the failed deploy workflow” |
| **12. Deploy platforms** | Render/Railway/Fly/Vercel rollback APIs | “roll back web-api to previous deploy” |
| **13. VMs** | Start/stop/resize with hard tags and limits | Last, and only after undo is real |

Nothing leaves Tier 0 until you have weeks of “the suggestion was right.” Then promote **one** playbook to Tier 1.

```
NOW                         OBSERVE LOOP                          CALYX-ONLY
 |---- 1 live loop ---- 2 chat ---- 3 detectors ---- 4 memory ----|
                              |---- 5 CLI/MCP ---- 6 deploys ---- 7 PRs ----|
                                                                    |---- 8 flags ---- 9 operator ---- 10 K8s ---- 11 CI ---- 12 rollback ---- 13 VMs ----|
```

Detailed build/validate notes: [`calyx-notes.md`](./calyx-notes.md).

---

## Architecture (target)

### Observe

- **Ingestion:** OpenTelemetry-compatible HTTP intake (`/v1/logs`), queue in front (Redis Streams now; Kafka later).
- **Storage:** Postgres now; ClickHouse when agent queries get aggregation-heavy. Vector index later for incident memory.
- **Agent:** Anthropic tool-use loop. Tools in a central registry. Slack / CLI / MCP are adapters only.
- **Detection:** Detectors emit `Anomaly`. A separate step decides whether to page and asks the LLM to write the card. New detector = new function, same shape.
- **Interfaces:** Slack first. CLI + MCP same tools. Web app only if something cannot live in chat.

### Control

- **Operator** inside the customer VPC/cluster (Datadog-agent / GitOps pattern).
- **Policy** in front of every `Action` (`dry_run`, `execute`, `undo`).
- **Audit log** immutable; reversibility required before an action can leave Tier 0.

### Later (not the path)

GitHub App, SSO/RBAC (Clerk/WorkOS), data residency, SOC2-class controls. After someone else is sending production logs.

---

## Web UI

Slack-style app lives in `apps/web`. Ask Calyx in-channel with `/calyx …` — AI replies can include Grafana-like chart panels. See [`apps/web/README.md`](./apps/web/README.md).

---

## Run locally

```bash
cp .env.example .env          # ANTHROPIC_API_KEY; Slack vars if using Slack
docker compose up --build
curl http://localhost:13000/health
```

Host ports: ingestion `13000`, Slack `13001` (profile `slack`), Postgres `15432`, Redis `16379`.

```bash
npm test
npm run dev:ingestion
npm run dev:consumer
npm run dev:slack
CALYX_TENANT_ID=demo npm run dev:mcp
npm run dev:mcp:http
npx tsx src/cli/index.ts ask -t demo "why are errors spiking?"
```

Coding-agent setup for Claude Code, Codex, Pi, Cursor, and other MCP clients: [`docs/MCP_CONNECTORS.md`](./docs/MCP_CONNECTORS.md).

---

