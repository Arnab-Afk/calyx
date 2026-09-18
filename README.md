# Calyx

**Working name for:** an AI-native observability platform, inspired by 
**Reference:** 

Everything below the architecture plan is research on  — the idea, philosophy, features, user flow, and hosting model — kept as background reference for building Calyx.

---

## Calyx — Architecture Plan

### Base pipeline

- **Ingestion:** OpenTelemetry-compatible HTTP intake endpoint, with a queue in front (Redis Streams/SQS for MVP, Kafka/Redpanda at scale) to decouple ingestion from processing.
- **Storage:** ClickHouse for the event store (built for the aggregation-heavy queries an AI agent generates), paired with a vector index (pgvector or ClickHouse's own vector search) for semantic memory of past incidents. Postgres + pgvector is a fine simpler starting point.
- **AI agent layer:** Claude with a small set of tools — `query_logs`, `search_code`, `get_deploy_history`, `search_past_incidents` — orchestrated with the Anthropic SDK's tool-use loop, or LangGraph if multi-step retry/state handling is needed.
- **Background agents:** durable job orchestration (Temporal, or cron + queue worker for MVP) running statistical anomaly detection (rolling averages/stddev on error rate, latency) with the LLM deciding whether to escalate and drafting the root-cause narrative.
- **Interfaces:** Slack app (primary entry point, Slack Bolt SDK), web dashboard (Next.js), CLI (thin wrapper over the REST/GraphQL API), and an MCP server exposing the same tools to coding agents like Claude Code and Cursor.
- **Integrations & multi-tenancy:** GitHub App for repo access and PR-based fixes; tenant isolation via `tenant_id` + row-level security (or physical separation if data residency is required); auth via Clerk/WorkOS for SSO/RBAC.

### Execution & control layer (VMs, CI/CD, deployments)

Extending Calyx from "reads your system and suggests fixes" to "can actually change your infrastructure" is a much bigger trust and safety surface than pure observability, and needs its own layer rather than just more agent tools — a bad read gives a wrong answer, a bad write takes down production.

**Where execution runs:** a lightweight operator inside the customer's own VPC or cluster, not Calyx's SaaS backend holding every customer's cloud credentials directly. Similar to the Datadog Agent or GitOps controllers like ArgoCD/Flux — Calyx's brain decides *what* should happen and sends a command; the operator, holding only narrowly-scoped local credentials, executes it. This also makes the sale easier: "send us your logs" is an easy yes, "give us write access to prod" is a much harder one unless the credentials never leave the customer's network.

**Flow:** Calyx brain (cloud) → approval gate → execution operator (runs inside customer VPC/cluster) → fans out to VMs & Kubernetes, CI/CD pipelines, or feature flags.

**Tiered approval gate** (the most important design decision here):
- *Tier 0 — suggest only.* Agent proposes the action in Slack, a human clicks "run it." Start here for anything risky (deploy rollback, VM resize).
- *Tier 1 — pre-approved playbooks.* Customer configures specific safe actions to run without a human in the loop, e.g. "auto-restart a pod on OOM" or "auto-rollback if error rate exceeds X% within 5 minutes of a deploy." Scoped, reversible, opted into explicitly.
- *Tier 2 — bounded autonomy.* Fully autonomous, but only within hard limits the customer sets (e.g. autoscale between 2–10 instances, never touch anything tagged `prod-critical`).
- Every action, proposed or executed, gets logged with who/what triggered it and a way to undo it. Reversibility is a hard requirement before anything graduates out of Tier 0.

**Concrete integrations per target:**
- *VMs / containers:* Kubernetes API (scoped service account) for pod restarts, deployment scaling, rollback to a previous ReplicaSet. AWS EC2 / GCP Compute SDKs for raw VM start/stop/resize.
- *CI/CD:* GitHub Actions API (`workflow_dispatch`, cancel run, re-run failed job); GitLab CI and CircleCI have equivalent REST APIs.
- *Deployment platforms:* Vercel, Render, Railway, Fly.io each expose a deploy/rollback API — worth native integrations given the target audience of fast-moving teams.
- *Feature flags:* LaunchDarkly/Unleash APIs. Flipping a flag is instant, cheap, and fully reversible — the best candidate for early Tier 1/2 autonomy, well before trusting the agent with a VM resize or deploy rollback.

**Build order:** get the observability core solid first, then add execution in order of increasing risk — feature-flag toggles → pod restarts/scaling → CI/CD triggers → deployment rollbacks → VM provisioning. Each stage stays at Tier 0 (suggest-only) until real usage data justifies moving it up a tier.

---

#  — AI-Native Observability

**Website:** 
**Tagline:** The AI-native observability platform for fast-moving engineering teams

## The Core Idea

 is pitched as a rethink of observability for the AI era. Instead of dashboards, query languages, and hand-configured monitors,  positions itself as an AI agent that lives inside a team's communication tools, watches production continuously, and answers questions about system health in plain language — for both human engineers and AI coding agents.

The product is built around three pillars, shown on the homepage as a tabbed sequence:

1. **Autonomous Alerts** — self-configuring alerts that need no setup and only escalate when something truly matters.
2. **Conversational Debugging** — asking questions about the system in natural language instead of digging through telemetry.
3. **Coding Agents Welcome** — deep integration with coding agents like Claude Code, Codex, and Cursor, so AI agents (not just humans) can investigate and even fix issues.

---

## The Manifesto ('s Philosophy)

 frames itself as more than a product — it's presented as a philosophy for observability in an AI-driven world, laid out across three arguments:

### 1. Less Is More
Observability tools have spent a decade accumulating features, dashboards, and configuration options, but this complexity hasn't made systems more reliable — it's mostly added cognitive load. These tools were built for platform specialists, not the product engineers who now also operate what they build. Since observability is fundamentally about answering questions ("Why is production down?", "Who is affected?", "What changed?", "How do we fix it?"),  argues the best interface for that job is chat, not dashboards or config files.

### 2. Logs Are All You Need
The traditional "three pillars" of observability — logs, metrics, and traces — are treated as redundant. Metrics and traces require brittle instrumentation and produce outputs (aggregations, flame graphs) that are hard for most people to read. Logs, by contrast, are simple to write and read, and match how humans naturally narrate events. 's argument is that logs, metrics, and traces are all just different shapes of the same underlying thing — events — so logs alone can be used to reconstruct the other two. What used to be a weakness of logs (their unstructured, freeform nature) becomes a strength in the AI era, since AI is good at extracting meaning from unstructured text at scale. Remaining challenges like cost and instrumentation gaps are addressed with summarization/compression/retention strategies and AI-driven auto-instrumentation.

### 3. Monitoring Is Dead
Static, threshold-based monitoring is described as fundamentally broken: tedious to maintain, prone to misfires, and reactive by nature (monitors get written after an incident already happened). 's answer is "Autonomous Alerts" — AI that continuously watches production, investigates anomalies on its own, and only surfaces an alert when it's actually worth a human's attention.

**Closing line of the manifesto:** *"Less noise. Less overhead. Less complexity. More clarity. More confidence. More speed."*

---

## Feature Breakdown

### 1. Autonomous Alerts
A persistent AI agent that sits in a team's chat tool (e.g., Slack), watches the system, and pages people only when necessary.

- **Zero-setup detection categories:**
  - *Error spikes* — correlates sudden error-rate jumps with recent deploys and names the likely cause.
  - *Slow queries* — flags degrading query performance and points to the specific table/query/missing index.
  - *Failed deploys* — monitors rollouts end-to-end and explains *why* a health check failed, not just that it did.
  - *Silent failures* — detects the absence of expected activity (e.g., no webhooks processed, no jobs running).
  - *Frustrated users* — correlates rage clicks, repeated form submissions, and support tickets to catch UX issues before churn.
  - *Runaway costs* — watches cloud spend in real time and flags anomalous spikes (e.g., a cache-miss storm inflating egress costs).
- **Sample alert format:** Each alert includes a severity/status, an "Impact" summary, a "Root cause" explanation, and a "Recommended action" — essentially a mini incident report generated automatically.
- **Memory** —  is said to learn from every incident: it remembers what broke, what fixed it, and what warning signs preceded it, and it adapts its baselines as the system evolves rather than relying on static thresholds.
- **Signals** — it correlates many kinds of input into one timeline: commits/deploys, internal Slack conversations, and customer support tickets, so alerts come with full context instead of a single noisy metric.
- **Other built-ins:** automatic error clustering (grouping thousands of related errors into one alert), a real-time system status view, and native integrations with Slack, PagerDuty, incident.io, email, and webhooks.

### 2. Conversational Debugging
The pitch here is "forget dashboards" — engineers (and teammates) ask questions about the system in plain language and get back root causes, visualizations, and suggested fixes, without needing a query language.

- **Query types supported:** error investigation, change correlation (linking deploys/config changes to performance shifts), root cause analysis, impact assessment (blast radius — how many users/requests/regions affected), trend analysis, and general system diagnostics.
- **Dynamic visualizations** — rather than a fixed dashboard,  is said to generate exactly the chart, table, or diagram a given question calls for (e.g., a latency question returns a chart, an impacted-users question returns a table), and these outputs can be shared or forked with teammates like a chat thread.
- **Multiplayer / swarm on incidents** — because it lives in shared chat channels, multiple teammates can question and investigate an incident together in the same thread.
- **Additional context features:**
  - *Code Search* —  is described as understanding the actual codebase/repositories/architecture, not just logs, so answers can reference real code.
  - *Perfect Memory* — retains history of past incidents, deployments, and errors, and is said to get more useful the longer a team uses it.
  - *Integrations* — connects to existing dev tools (code hosting, communication platforms) rather than requiring new workflows.

### 3. Coding Agents Welcome
Positions  as observability built for AI agents as much as for humans — explicitly naming Claude Code, Codex, and Cursor as supported.

- **CLI capabilities:** ask natural-language questions from the terminal, run structured log queries, search past debugging threads by keyword, tail/stream logs live, connect new data sources through a guided setup, and manage/list projects and environments — all from the command line.
- **Agent "skills"** highlighted: `investigate-error` (full root-cause tracing tied to deploys and related incidents), `check-system-health` (instant cross-environment status check), and `trace-request` (following a single request across the whole stack to find bottlenecks).
- **Built for agent consumption:**
  - *Agent-Friendly Docs* — documentation structured specifically to be machine-readable by AI agents.
  - *MCP Server* — native Model Context Protocol support so coding agents can query logs, search threads, and investigate errors without leaving the IDE.
  - *Robust API* — full REST and GraphQL API coverage so every feature is scriptable/automatable.
- A homepage demo shows the agent going a step further than just diagnosing: after being asked in chat to fix a Lambda timeout,  is shown launching a Cursor cloud agent that opens an actual pull request to make the fix — i.e., the loop goes from "alert" → "diagnosis" → "AI-authored code fix," with a human still reviewing/merging the PR.

---

## The User Flow

The site's demos (mainly the Slack-style chat panels used throughout the homepage and feature pages) sketch out a fairly consistent end-to-end flow for how a team actually experiences the product:

### 1. Something happens in production
 is passively watching logs, deploys, errors, support tickets, and chat in the background — no monitors to configure ahead of time.

### 2.  posts an alert into the team's chat channel
Instead of a raw metric breach, the alert arrives as a structured mini-report with four parts: **Severity/Status**, **Impact** (what's happening and to whom), **Root cause** ('s own investigation, already correlated with recent deploys/config changes), and **Recommended action** (a concrete fix, sometimes literally the command to run). Two action buttons sit under the alert: *View in * and *Start an Incident*.

### 3. The team interrogates the alert in plain language, right in the thread
Engineers reply to the bot with follow-up questions instead of switching tools — e.g. *"Can we determine when this became a problem?"* or *"How many customers are affected?"*  answers inline, generating exactly the chart, table, or diagram the question calls for (a latency question gets a chart, an impacted-users question gets a table). Multiple teammates can pile into the same thread at once ("swarm on incidents"), so debugging becomes a shared, forkable conversation rather than one person alone in a dashboard.

### 4. The user hands the fix off to a coding agent, without leaving chat
Someone tags a coding agent directly in the thread — e.g. *"@Calyx can you tell @Cursor to increase timeout on the api lambda"*.  launches a cloud coding agent (Cursor, Claude Code, etc.), which opens a real pull request, and posts the PR link back into the same thread for review.

### 5. The loop closes
A human reviews/merges the PR, the incident is marked resolved, and the whole exchange — root cause, discussion, and fix — is retained as searchable history ("Perfect Memory"), so the next time something similar happens,  can surface it automatically.

### Parallel flow: engineers working from the terminal or IDE
For people who live in the CLI/IDE instead of chat, the same underlying flow is exposed as commands rather than conversation:
- ` messages send "<question>" --wait` → ask a question and get a root-cause answer with recommended fixes.
- ` logs query ...` / ` logs tail ...` → search or stream logs directly.
- ` threads search "<keyword>"` → pull up a past debugging conversation instead of starting from scratch.
- ` data-sources connect` → onboard a new service in a few guided prompts.
- Under the hood, this same capability is exposed to AI coding agents themselves via an MCP server, so an agent like Claude Code can run this whole investigate → diagnose → fix loop autonomously inside the IDE.

**In short:** the flow is designed to never pull the user out of where they already are — alert → conversation → fix all happen inside Slack (or the terminal/IDE), instead of requiring a trip to a separate observability dashboard.

---

## Other Product Claims

- **Instrumentation:** "Instrument in minutes" — claims to support ingesting logs in any format from any cloud/technology, positioned as low-effort rather than invasive.
- **Ecosystem fit:** "Works with your apps" — designed to plug into a team's existing chat and incident-response tools rather than becoming a separate destination.
- **Security & compliance:** claims SOC 2, ISO 27001, HIPAA, and GDPR compliance, plus data residency controls (choice of storage region/data center), end-to-end encryption in transit and at rest, and role-based access control (RBAC) with audit trails.

---

## Company Snapshot

- **Backers/advisors** listed on the site include people associated with Mastra, MLOps Community, Daytona, LangChain, Brex, Codegen, Fastino, Browserbase, Vercel, Cockroach Labs, Graphite, Anthropic, Untapped Capital, Replit, and Homebrew.
- **Manifesto publish date:** March 16, 2026.
- **Site sections:** Home, About, Careers, Blog, Features (Autonomous Alerts / Conversational Debugging / Coding Agents Welcome), plus legal pages (Privacy, Terms, DPA).

---

## One-Line Summary

 is an AI-agent-first observability platform that replaces dashboards and manually configured monitors with a chat-based system that autonomously watches production, explains problems in plain language to both humans and coding agents, and can hand off fixes directly to tools like Cursor or Claude Code.
