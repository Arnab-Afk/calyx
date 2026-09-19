# Decision log

Append-only. Newest at the bottom. Never edit or delete a past entry — supersede it.

---

## D-001 — Build Calyx as a complete product rather than a hackathon-only demo

**Date:** 2026-09-19
**Status:** accepted

**Context.** The initial planning optimized for a short AWS hackathon demonstration. The product direction now requires durable integrations and compatibility beyond the event.

**Options considered.**
- **Hackathon slice** — implement only the shortest CloudWatch-to-demo path.
- **Product foundation** — preserve the incident-loop priority while designing external interfaces for tenant isolation, lifecycle management, and broad client compatibility.

**Decision.** We chose the product foundation.

**Because.** MCP, authentication, connectors, and incidents become expensive to replace if their boundaries are demo-specific. A production-shaped vertical slice can still be demonstrated while remaining reusable.

**Consequence.** Delivery is broken into verified product slices rather than one-off mocks. AWS remains an important connector/deployment target but no longer defines the complete product scope.

---

## D-002 — Support MCP through scoped stdio and authenticated Streamable HTTP

**Date:** 2026-09-19
**Status:** accepted

**Context.** Coding agents vary in transport and authentication support. Local stdio is universally useful for development, while a product service needs remote sessions and revocable credentials.

**Options considered.**
- **stdio only** — simple, but requires local database access and cannot provide a hosted connector.
- **Legacy HTTP+SSE** — broadly deployed but deprecated by the MCP SDK.
- **Streamable HTTP only** — correct for hosted use but less convenient for local tools.
- **stdio plus Streamable HTTP** — one scoped tool surface with transport-specific hosting.

**Decision.** We chose stdio plus stateful Streamable HTTP, with legacy SSE excluded.

**Because.** Both are standard MCP transports and cover Claude Code, Codex, Pi, Cursor, and other clients without duplicating tool logic.

**Consequence.** Each server instance is bound to one authenticated tenant. HTTP sessions are stateful and must be managed across process lifetime; horizontal scaling will later require session affinity or an external session/event store.

---

## D-003 — Stream live logs through a portable cursor-based long-poll tool

**Date:** 2026-09-19
**Status:** accepted

**Context.** MCP supports server notifications, but coding-agent clients differ in whether and how they expose unsolicited notifications to the model.

**Options considered.**
- **Logging notifications/resources subscriptions** — push-based but inconsistently surfaced by clients.
- **One large blocking tool call** — hard to cancel and prone to client timeouts.
- **Bounded long polling with an opaque cursor** — works anywhere tools work and allows cancellation between calls.

**Decision.** We chose `tail_logs` with a maximum 25-second wait and opaque `(ingested_at, id)` cursor.

**Because.** It provides duplicate-resistant live following through the lowest common MCP capability.

**Consequence.** Agents must call the tool repeatedly. Native subscription resources can be added later as an optimization without replacing the portable tool.

---

## D-004 — Expose natural-language investigation as a scoped wrapper over the shared agent

**Date:** 2026-09-19
**Status:** accepted

**Context.** IDE users need the same “ask Calyx” workflow available in web chat, Slack, and CLI without creating a second investigation backend. The wrapper must not recursively invoke itself or allow model-generated tenant identifiers to cross tenant boundaries.

**Options considered.**
- **Duplicate the investigation flow in MCP** — gives transport-specific control but creates divergent reasoning and evidence behavior.
- **Call the public HTTP ask route** — adds an unnecessary network and authentication hop inside the same service.
- **Register an `ask` tool that invokes the shared agent loop** — preserves one tool registry and one investigation implementation.

**Decision.** We chose a registry-backed `ask` tool gated by `incidents:ask`. The shared loop excludes `ask` from model-visible nested tools and overwrites every model-produced tool-call tenant with its authenticated run tenant.

**Because.** MCP receives the same evidence-backed answer and tool-call trace as other product surfaces while recursive calls and tenant injection fail by construction.

**Consequence.** Provider credentials remain required to execute `ask`; deterministic evidence tools remain available independently under their own scopes.

---

## D-005 — Persist detector output as tenant-scoped alert context

**Date:** 2026-09-19
**Status:** accepted

**Context.** Web, Slack, and IDE investigations need one stable alert identifier and evidence record. Recomputing an alert independently in each surface would produce inconsistent context, while storing only a rendered notification would discard detector evidence.

**Options considered.**
- **Recompute from recent logs on every surface** — simple but unstable and cannot support alert deep links.
- **Persist rendered Slack/web cards** — tightly couples the evidence model to presentation.
- **Persist detector anomalies and retrieve nearby evidence by alert ID** — keeps detection facts durable and presentation-neutral.

**Decision.** We chose a tenant-scoped `alert_contexts` record keyed by detector type and service. Repeated detections update the same record and increment an occurrence count. `get_alert_context` returns that record plus nearby error events.

**Because.** All product surfaces can hand off one opaque alert ID while server-side tenant filtering prevents cross-workspace retrieval.

**Consequence.** Notification dispatch remains separate. A later incident model may group multiple alert contexts without changing their IDs or evidence history.
