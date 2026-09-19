# Calyx

**Status:** in progress
**Last reviewed:** 2026-09-19

## What this is

Calyx is an AI-native incident investigation product for small engineering teams. It ingests production telemetry, detects abnormal behaviour, grounds investigations in evidence, and makes the same incident context available in the Calyx web app, Slack, CLI, and MCP-compatible coding agents.

## Why it exists

Small teams can ship software faster than they can diagnose it. Logs and alerts identify symptoms, but developers still lose time moving between dashboards, source code, chat, and deployment systems to determine what broke and what to do safely.

## In scope

- Multi-tenant log and telemetry ingestion with external data-source connectors
- Automatic anomaly detection and durable incidents
- Evidence-backed AI investigations and incident-scoped conversation memory
- Web and Slack incident collaboration
- Authenticated MCP access for Claude Code, Codex, Pi, Cursor, and compatible clients
- GitHub/deployment correlation and safe code-agent handoff
- Human-approved, auditable remediation actions
- Production deployment, observability, security, and lifecycle management

## Out of scope

- Unapproved autonomous production changes — unsafe until policies, audit, and undo are proven
- APM feature parity with every observability vendor — Calyx focuses on investigation and response
- Supporting every telemetry backend in the first release — connectors are added behind one normalized evidence model

## Success looks like

- A team connects telemetry and a repository, then receives a deduplicated incident without configuring a static monitor.
- Every factual incident claim links to captured evidence and hypotheses are labelled as uncertain.
- A developer can investigate the same incident from web, Slack, or an authenticated coding agent without cross-tenant data leakage.
- Recommended changes require explicit approval and produce an immutable audit record.
- The core incident path is deployed, monitored, tested, and recoverable.

## Constraints

- Tenant identity must be server-derived at every external boundary.
- Credentials are never stored in plaintext or committed to git.
- MCP uses standard stdio and Streamable HTTP transports for broad client compatibility.
- Existing shared schemas and central tool registry remain the integration boundary.
