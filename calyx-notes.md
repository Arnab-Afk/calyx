# Calyx — Notes

## Build & Validation Plan

Each phase covers three lenses: what to build, how to know it's actually working, and the design decision that keeps it from needing a rewrite later.

---

### 1. Ingestion + Storage

**Build:** One canonical event schema — `{tenant_id, timestamp, service, level, message, trace_id, span_id, attributes: {}}` — with `attributes` as an open map, not a rigid column set. Version the intake endpoint (`/v1/logs`) from day one.

**Validate:** Send synthetic logs with known content, query the DB directly, confirm counts and timestamps match exactly (watch for timezone bugs). Burst-test at 10x expected volume and confirm nothing silently drops. Decide and test your dedup behavior explicitly — don't leave it undefined.

**Foundation:** `tenant_id` on every row from the start means your second real customer is a new row, not a migration. The open `attributes` map means new sources later (K8s events, CI/CD webhooks, support tickets) reuse this same table instead of needing new ones.

---

### 2. Tool-Using Agent

**Build:** Define a `Tool` interface (name, description, input schema, handler) and a central registry. Keep the orchestration loop (calls Claude, manages state) separate from the tools themselves.

**Validate:** Build a golden set of ~15 fixed questions with known-correct answers against seeded data. Rerun it as a regression suite every time you touch the agent. Include a case with no matching data and confirm the agent says so instead of guessing.

**Foundation:** Because tools live in a registry, Slack/CLI/MCP later all call the *same* tools instead of three separate implementations drifting apart. Standardize each tool's output shape now (`summary` + `data` + `visualization_hint`) so the same output can render as a Slack block, a web chart, or plain CLI text without touching the tool.

---

### 3. Slack App

**Build:** Slack is purely an adapter that calls into the agent/tool layer — no agent logic lives in the Slack handler. Build the alert-card format (Impact/Root cause/Recommended action) as a shared template, not something hardcoded to Slack.

**Validate:** Fire a synthetic alert, check formatting and buttons. Have two people reply in the same thread and confirm both get correctly attributed responses with full thread context.

**Foundation:** Because Slack is "just an adapter," the web app you build later reuses the same conversation-handling code instead of reimplementing it.

---

### 4. Background Anomaly Detection

**Build:** Define an `Anomaly` object (type, severity, evidence) that detectors emit — detection and alert-dispatch are separate steps. Implement one detector (error-rate stddev) as the first instance.

**Validate:** Feed it synthetic time series with a known injected spike — confirm it fires on the spike and not on normal noise. Run it against several days of "normal" synthetic traffic first to measure your false-positive rate before trusting it. Confirm a persisting anomaly doesn't spam a new alert every cycle.

**Foundation:** New detector types (slow queries, failed deploys) later are just new functions emitting the same `Anomaly` shape — the dispatch and Slack-posting code never changes.

---

### 5. MCP + CLI

**Build:** Since tools already live in a registry, the MCP server and CLI are thin wrappers over it — no new logic, just new transports.

**Validate:** Call the MCP server from an actual coding agent against seeded data and check it gets structured, correct answers. Scripted smoke tests for each CLI command against known data, checking exit codes and output.

**Foundation:** Because these are thin adapters, tool #10 you add next month automatically shows up in Slack, CLI, and MCP without touching any of them again.

---

### 6. Execution Layer

**Build:** Define an `Action` interface — `dry_run()`, `execute()`, `undo()` (or explicit "not reversible") — even for your first trivial action (a flag toggle). Approval-tier logic sits as a policy layer in front of *every* action, driven by config, not hardcoded per action.

**Validate:** Make `dry_run()` in staging a hard gate before anything can execute for real. Audit-log test: every `execute()` call, approved or automatic, writes an immutable before/after record. Chaos test: deliberately have the agent propose a wrong action in a sandbox and confirm the approval gate actually stops it.

**Foundation:** Every future action type (VM resize, CI/CD rollback) is just a new class implementing the same three methods, registered with a default tier — nothing else in the system changes.

---

## The Meta-Rule

Keep a small `schemas/` package (Event, Anomaly, Alert, Action, Tool) that every layer imports rather than each part of the system inventing its own shape. This single decision is what actually prevents the rebuild — it's the difference between "add a new integration" being additive versus being a migration.
