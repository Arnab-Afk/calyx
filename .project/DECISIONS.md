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

---

## D-006 — Model incidents separately from alerts and preserve evidence snapshots

**Date:** 2026-09-19
**Status:** accepted

**Context.** Detector alerts are individual signals, while an incident is the investigation unit that may eventually group several signals and human notes. The existing `search_past_incidents` name incorrectly described raw log keyword matches as incidents.

**Options considered.**

- **Treat alert contexts as incidents** — minimal storage but prevents multi-signal grouping and lifecycle state.
- **Replace `search_past_incidents` in place** — cleans the API but silently changes results for existing clients.
- **Add incidents, alert links, and immutable evidence snapshots** — introduces the correct domain boundary and permits explicit compatibility migration.

**Decision.** We chose separate tenant-scoped incident, incident-alert link, and evidence tables. New `list_incidents`, `get_incident`, and `search_incidents` tools use them. `search_past_incidents` remains temporarily as a clearly deprecated raw-log tool.

**Because.** Alert detection can evolve independently from incident investigation, while snapshots preserve what was known at each detector occurrence.

**Consequence.** Each new alert currently opens one incident automatically; future correlation can attach multiple alerts to an incident through the existing link table. Removing the compatibility tool requires a versioned release.

---

## D-007 — Deliver autonomous alerts through a durable outbox

**Date:** 2026-09-19
**Status:** accepted

**Context.** Detection must run without a user request and notifications must survive process crashes, provider outages, and restarts. Calling Slack directly inside detector code would couple evidence generation to presentation and lose failed deliveries.

**Options considered.**

- **Post directly from the detector** — minimal, but failures are lost and provider latency blocks detection.
- **Use an in-memory retry queue** — decouples code but loses state on restart and cannot coordinate workers.
- **Persist an alert delivery outbox** — supports deduplication, retries, leases, and independent destination handlers.

**Decision.** We chose a PostgreSQL outbox keyed by alert, destination, and target. The scheduler discovers recently active tenant/services, persists detection results, enqueues configured tenant destinations, and separately claims deliveries with `SKIP LOCKED`.

**Because.** Evidence remains canonical even when notification providers fail, and tenant-to-channel routing is explicit rather than inferred from client input.

**Consequence.** Slack is the first delivery handler. Web delivery remains disabled until an authenticated workspace notification target exists. Failed deliveries retry with backoff up to five attempts.

---

## D-008 — Authorize Slack lifecycle actions through durable delivery context

**Date:** 2026-09-19
**Status:** accepted

**Context.** Slack acknowledgement and resolution were stored in a process-local map, so state disappeared on restart and diverged from MCP/web incident status. An opaque alert ID alone is not enough authorization for a Slack action originating in an arbitrary channel.

**Options considered.**

- **Keep Slack-local state** — simple but non-durable and invisible to other surfaces.
- **Update by alert ID alone** — durable but permits a copied action payload from an unrelated channel.
- **Require a delivered alert/channel match and update alert plus incident transactionally** — durable, shared, and bound to the notification destination.

**Decision.** We chose canonical PostgreSQL lifecycle fields. Slack actions succeed only when a delivered outbox row matches the alert and channel. Acknowledgement moves the incident to investigating; resolution updates both records in one transaction.

**Because.** Slack, MCP, and future web views observe one state, while channel-bound authorization limits replay of copied action payloads.

**Consequence.** Alert cards now include an acknowledge action. Actor IDs are Slack user IDs until a cross-provider identity mapping is introduced.

---

## D-009 — Enforce hosted MCP limits and audit through PostgreSQL

**Date:** 2026-09-19
**Status:** accepted

**Context.** A hosted MCP endpoint needs abuse controls and a durable security trail across replicas. Process-local counters and logs disappear on restart and diverge under horizontal scaling.

**Options considered.**

- **In-memory counters and application logs** — low latency but not shared or durable.
- **External rate-limit/audit services** — scalable but introduces another required system before deployment.
- **PostgreSQL fixed-window counters and structured audit rows** — immediately shared, transactional, and operable with the existing stack.

**Decision.** We chose PostgreSQL-backed per-credential and anonymous-peer minute windows, plus structured audit events for credential lifecycle, authentication, sessions, requests, and tool outcomes.

**Because.** Every current deployment already requires PostgreSQL, and no plaintext token or tool argument needs to enter the audit trail.

**Consequence.** The default authenticated limit is 120 requests/minute and is configurable. Old counter windows are pruned automatically. A distributed edge limiter can replace the implementation later without changing HTTP behavior.

---

## D-010 — Resolve web workspaces to observability tenants in PostgreSQL

**Date:** 2026-09-19
**Status:** accepted

**Context.** Convex authenticates web users and workspace membership, while PostgreSQL owns telemetry tenants and MCP credentials. Treating a Convex workspace ID as a tenant ID would silently expose or create data under the wrong security boundary.

**Options considered.**

- **Use workspace IDs as tenant IDs** — simple but conflates independent identity systems.
- **Let the browser or Convex action submit a tenant ID** — flexible but permits tenant selection at the credential boundary.
- **Persist an operator-established workspace-to-tenant link in PostgreSQL** — keeps tenant resolution inside the credential authority.

**Decision.** We chose immutable `workspace_tenant_links`. Convex verifies workspace-admin membership and sends only the workspace ID through a server-only internal secret; Calyx resolves the tenant before every credential operation.

**Because.** Neither browser code nor a compromised workspace member can select another observability tenant, and PostgreSQL remains the credential source of truth.

**Consequence.** An operator must link each workspace once before connector self-service works. Remapping to a different tenant is rejected and requires an explicit future migration workflow.

---

## D-011 — Use an external OAuth issuer and keep Calyx as the protected resource

**Date:** 2026-09-19
**Status:** accepted

**Context.** Hosted MCP clients need browser OAuth, but Calyx should not implement passwords, browser sessions, consent, dynamic client registration, and refresh-token security as a new identity provider.

**Options considered.**

- **Build a Calyx authorization server** — maximum control but creates a large new authentication attack surface.
- **API keys only** — sufficient for machines but not standards-based browser authorization.
- **External OAuth 2.1/OIDC issuer plus token introspection** — delegates browser login and consent while Calyx remains responsible for tenant and scope enforcement.

**Decision.** We chose protected-resource mode with RFC 9728 metadata and RFC 7662 token introspection. API keys remain supported. OAuth tokens require active status, subject, server-issued tenant, supported scopes, expiry, and an audience matching the configured MCP resource URL.

**Because.** Established identity providers handle authorization code + PKCE, client registration, refresh, consent, and revocation, while Calyx never trusts browser-supplied tenant identity.

**Consequence.** Production deployment must configure an HTTPS issuer and register Calyx as a resource/introspection client. OAuth subjects use a separate shared rate-limit bucket from API-key credentials.

---

## D-012 — Default hosted MCP to stateless Streamable HTTP

**Date:** 2026-09-19
**Status:** accepted; supersedes the stateful-default consequence of D-002

**Context.** SDK transport objects and protocol servers contain live connection state that cannot be serialized safely into PostgreSQL. Process-local session maps require sticky routing and lose sessions during deploys.

**Options considered.**

- **Externalize SDK transport objects** — not supported because live streams and callbacks are process resources.
- **Require affinity for every deployment** — preserves resumability but complicates scaling and rolling deploys.
- **Use stateless Streamable HTTP by default** — each POST is independent and any replica can serve it.

**Decision.** We chose stateless mode as the production default. Explicit `stateful` mode remains for single-instance or affinity deployments that need GET/SSE sessions.

**Because.** Current Calyx capabilities are request/response tools, and portable live logs already use cursor-based `tail_logs`; they do not require transport-level session persistence.

**Consequence.** Stateless mode accepts POST only and sacrifices unsolicited server streams. Stateful mode advertises its process-local session count and requires load-balancer affinity.

---

## D-013 — Replace Convex chat plane with a Go API; keep Node for observability

**Date:** 2026-09-20
**Status:** accepted

**Context.** The Slack-style web UI depended on Convex for auth, workspaces, channels, and messages, while logs/agent/MCP already run on the Node/Postgres stack. We need a deployable, first-party backend without a dual-runtime chat store.

**Options considered.**

- **Keep Convex** — fastest UI iteration, but couples the product to a proprietary realtime DB and complicates self-host deploy.
- **Move chat into the existing Node Fastify service** — one runtime, but mixes chat and observability concerns and slows the “finish backend for deploy” goal.
- **Greenfield Go chat API** sharing Postgres — clear ownership boundary; Node stays the observability plane.

**Decision.** Ship `apps/api` (Go) as the chat backend (`chat_*` tables, JWT auth, REST + WebSocket). Observability remains Node on `:13000` / MCP `:13002`. Frontend migration off Convex is a follow-up once the API is deployed and smoke-tested.

**Because.** Deployability and a single Postgres source of truth for product data matter more than keeping Convex’s free subscriptions during this phase.

**Consequence.** Next.js must later swap Convex hooks for the Go HTTP/WS client. Until then both can run; do not write new Convex chat features.

---

## D-014 — Harden the Go identity boundary before migrating the frontend

**Date:** 2026-09-20
**Status:** accepted

**Context.** The initial Go API proves the chat data model and REST flow, but the browser cannot safely migrate while production configuration is permissive, WebSockets depend on a bearer header browsers cannot set, and trusted Calyx message metadata can be submitted by ordinary clients.

**Options considered.**

- **Migrate the UI immediately** — demonstrates progress but carries insecure session and trust boundaries into every hook.
- **Keep Convex indefinitely** — avoids migration work but contradicts D-013 and preserves two identity planes.
- **Harden Go first, then migrate one vertical frontend slice at a time** — establishes the target security contract before client coupling.

**Decision.** Go issues issuer/audience-bound JWTs through both bearer responses and HTTP-only browser cookies. Production fails closed without a strong secret or with wildcard CORS. WebSockets use the same cookie and explicit origin allowlist. User message endpoints cannot mint trusted Calyx metadata.

**Because.** Authentication, tenant membership, and trusted AI presentation are expensive boundaries to retrofit after frontend migration.

**Consequence.** Go hardening and API parity precede remediation work. Next.js migration follows as focused auth/workspace, channel/message, realtime, and MCP-administration slices.

---

## D-015 — Represent remediation approval as a durable server-side state transition

**Date:** 2026-09-20
**Status:** accepted

**Context.** The original execution prototype stored pending actions and audit snapshots in process memory and accepted a caller-provided `human_approved` boolean. Restarts lost approvals, multiple replicas could execute twice, and no durable artifact proved who approved what.

**Options considered.**

- **Retain the in-memory gate** — sufficient for demos but unsafe for production changes.
- **Persist only audit messages after execution** — durable history, but still permits races and fabricated approval claims.
- **Persist the proposal and claim its transition atomically before execution** — binds dry run, parameters, approver, reason, and outcome to one request.

**Decision.** PostgreSQL owns remediation requests and immutable transition events. Every action is proposed after a successful dry run and remains pending until an authorized human claims it. Approval, rejection, execution, and undo accept a request ID rather than tenant/action parameters or a boolean approval claim.

**Because.** The action parameters and tenant must come from the persisted proposal, and an atomic `pending → executing` transition guarantees that concurrent approvals cannot both run the action.

**Consequence.** Slack approvers are fail-closed through an explicit user-ID allowlist. A process crash after claiming an action leaves it in `executing` for manual reconciliation rather than risking an automatic duplicate side effect. Real operator integrations must add provider idempotency before production rollout.

---

## D-016 — Execute production remediation through a tenant-owned signed operator

**Date:** 2026-09-20
**Status:** accepted

**Context.** Calyx needs to turn evidence-backed incident recommendations into real infrastructure changes without receiving customers’ provider credentials or granting the model direct execution authority.

**Options considered.**

- **Embed provider SDK credentials in Calyx** — convenient, but expands the control plane’s secret and privilege surface.
- **Let coding agents execute commands directly** — flexible, but difficult to constrain, approve, and reconcile safely.
- **Call a customer-side operator with a signed, allowlisted protocol** — keeps credentials and final provider policy inside the customer boundary.

**Decision.** Calyx proposes `operator_webhook` requests linked to active incidents. It signs bounded dry-run and execute payloads with a per-tenant secret, uses the remediation request ID as the provider idempotency key, and permits only tenant-configured operation names. Execution still requires the existing durable human approval transition.

**Because.** A narrow operator contract separates recommendation and approval from privileged provider access while giving both systems a stable reconciliation identifier.

**Consequence.** Operator endpoints must use HTTPS in production, verify timestamp/HMAC/idempotency, and enforce their own target policy. Calyx does not automatically replay an execution after an ambiguous timeout. Slack approval-card delivery is a durable retrying outbox rather than an in-process best effort.

---

## D-017 — Coding agents submit bounded files; Calyx owns GitHub credentials and draft PR creation

**Date:** 2026-09-20
**Status:** accepted

**Context.** Incident investigations need a coding-agent handoff, but giving an external agent a reusable GitHub token or merge authority would expand the trust boundary substantially.

**Decision.** Calyx creates durable incident/repository jobs and dispatches a single-job capability. Agents search and read repository content through bounded Calyx endpoints, then submit complete file contents. Calyx alone exchanges the GitHub App installation token, creates a job-specific branch, and opens a draft pull request. It exposes no merge or deploy operation.

**Because.** The agent needs enough access to propose a fix, not standing repository credentials or production authority. The callback digest, atomic submission claim, file/count limits, and append-only events provide a narrow auditable boundary.

**Consequence.** A configured external dispatcher remains responsible for sandboxed code execution and tests. GitHub App installation OAuth must provision and validate installation IDs before this workflow can be enabled for customers.

---

## D-018 — Accept GitHub installation identity only through single-use setup state

**Date:** 2026-09-20
**Status:** accepted

**Context.** The management API previously accepted caller-supplied installation IDs and returned webhook secrets for manual setup. That cannot establish that an installation belongs to the selected repository or tenant.

**Decision.** A management request now creates a random, hashed, ten-minute state bound to tenant, project, and repository. The GitHub setup callback consumes it once, verifies the installation ID against GitHub’s repository-installation endpoint, provisions the signed webhook, and only then persists the connection.

**Because.** Installation IDs are identifiers, not credentials or proof of repository access. Validation must happen server-to-server under the App identity and remain bound to the authenticated project selection.

**Consequence.** Failed callbacks require restarting setup and cannot be replayed. Browser code never receives the webhook secret or App private key. Disconnect attempts webhook cleanup but removes stale local state even if the installation was already revoked.

---

## D-019 — Use Redis pub/sub for ephemeral realtime and versioned SQL for Go schema

**Date:** 2026-09-20
**Status:** accepted

**Context.** Go WebSocket clients were registered in process memory, so replicas could not deliver each other’s events. The Go API also executed one embedded startup DDL block, which had no immutable migration history or deployment gate.

**Decision.** Each Go replica delivers locally-created events immediately and publishes an origin-tagged envelope on one Redis channel. Other replicas route the raw event only to clients in the matching workspace. Production requires Redis. Go schema changes are ordered embedded SQL files recorded with SHA-256 checksums, applied transactionally under a PostgreSQL advisory lock by a standalone release binary.

**Because.** Chat events are ephemeral invalidation/delivery signals while PostgreSQL remains the durable source of truth. Redis provides cross-replica fan-out without making it authoritative. Checksummed migrations make schema state reproducible and prevent silent edits to applied history.

**Consequence.** Redis outages degrade realtime delivery but do not erase persisted chat data. Slow WebSocket clients can still drop events and must refetch durable state. Deployments must run `/app/calyx-migrate` before starting API replicas; the API no longer creates schema at startup.
