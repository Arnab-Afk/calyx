# Calyx MCP baseline (handoff)

**Audience:** teammate building Claude Code + Codex MCP (and later Cursor / Gemini).  
**Status:** Act I foundation — observe & explain. Act II (infra writes) is out of scope for this baseline.  
**Companion docs:** [`MCP_CONNECTORS.md`](./MCP_CONNECTORS.md) (client setup), root [`README.md`](../README.md) (product loop).

---

## 1. Product in one picture

Calyx has **three doors** into the **same brain**. MCP is door #3.

```
┌─────────────────────────────────────────────────────────────────┐
│  Customer app X                                                 │
│    Frontend (A) ──logs──┐                                       │
│    Backend  (B) ──logs──┼──► Calyx ingest (tenant_id)           │
│    GitHub repo  ────────┘     (+ deploys / commits later)       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    detectors watch (no Grafana)
                                │
                    autonomous alert card
                    (severity · impact · root cause · action)
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        Calyx chat UI      Slack thread      MCP (this work)
        /calyx ask         @Calyx …         Claude / Codex /
                                            Cursor / Gemini
```

**User story (the flow you must keep coherent):**

1. Founder connects **logs from A + B** and (soon) the **GitHub repo** for app X.  
2. Users start getting `404` / `500`s → Calyx **notifies** (autonomous alert).  
3. They debug wherever they are:
   - phone / out → **Slack or Calyx chat**
   - in the IDE → **MCP** pulls the same live evidence into Claude Code / Codex  
4. Same tenant, same tools, same truth. Chat UI is not a second backend.

---

## 2. What already exists (do not reinvent)

| Layer | Location | Notes |
|---|---|---|
| Agent tools | `src/agent/tools/*.ts` + registry in `src/agent/index.ts` | Source of truth for capabilities |
| MCP server | `src/mcp/server.ts`, `src/mcp/http-server.ts`, `src/mcp/auth.ts` | stdio + Streamable HTTP |
| Ingest / ask HTTP | `src/ingestion/` — `POST /v1/logs`, `POST /v1/ask` | Ports: ingest **13000**, MCP HTTP **13002** |
| Storage | `src/storage/events.ts` | Postgres events keyed by `tenant_id` |
| Detection | `src/detection/` | Error-rate detector exists; Slack loop still incomplete |
| Web chat | `apps/web` — `/calyx` → `POST /api/calyx/ask` → Calyx API | Charts / gallery are UI; not MCP backends |
| Client setup | `docs/MCP_CONNECTORS.md` | Claude + Codex snippets already written |

### Tools live on MCP today

| Tool | Purpose |
|---|---|
| `query_logs` | Historical logs by service / level / time |
| `get_service_stats` | Event counts + error rates |
| `search_past_incidents` | Keyword search over log evidence (name is aspirational — not a real incidents table yet) |
| `tail_logs` | Long-poll new events via `next_cursor` |

**Auth rule (non-negotiable):** server injects `tenant_id` from the API key / env. Clients **never** pass `tenant_id`. Scopes: `logs:read` | `incidents:read` | `incidents:ask`.

---

## 3. Baseline you should deliver (ordered)

Ship in this order so chat / Slack / MCP stay one product.

### Phase 0 — Baseline “works in Claude + Codex” (1–3 days)

Goal: friend can paste a token, ask “why are we getting 404s?”, and get real log evidence.

- [ ] Confirm **HTTP** transport: `GET/POST http://127.0.0.1:13002/mcp` with bearer key  
- [ ] Confirm **stdio** transport for local Claude: `npm run dev:mcp` + `CALYX_TENANT_ID`  
- [ ] Smoke-test all 4 tools against a seeded tenant (`default`)  
- [ ] Document one golden path in the PR description (copy from §6)  
- [ ] Add / verify **Claude Code** + **Codex** config snippets (already in `MCP_CONNECTORS.md` — keep them truthful)

**Acceptance:** From Claude Code *and* Codex, without opening the Calyx UI, you can:

1. List what’s noisy (`get_service_stats`)  
2. Pull 404/500 samples (`query_logs`)  
3. Follow new errors live (`tail_logs`)

### Phase 1 — Close the “ask” gap (next)

Scope `incidents:ask` already exists but is unused.

- [ ] Add MCP tool **`ask`** → thin wrapper over `runAgent` / `POST /v1/ask`  
- [ ] Return structured result: `{ answer, toolCalls[], chartHint? }` (mirror web `calyxData` shape enough that IDE agents can cite tools)  
- [ ] Same rate limits / timeouts as HTTP ask

**Why:** Founders will say “ask Calyx” in Claude the same way they type `/calyx` in chat. One brain.

### Phase 2 — Small tools that unlock the story

| Tool | Backed by | Why |
|---|---|---|
| `list_services` ✅ | `getDistinctServices` | “What did I connect?” |
| `get_alert_context` ✅ | durable alert context + nearby error events | Bridge alert → IDE (“investigate this”) |
| `search_incidents` ✅; deprecate `search_past_incidents` | durable incidents; compatibility alias retained temporarily | Don’t fake an incidents product |

### Phase 3 — Stay aligned with the rest of the team (later, don’t block)

These are **not** your first PR, but design tools so they won’t break:

| Capability | Owner-ish | MCP impact |
|---|---|---|
| Connect FE + BE log sources | ingest / connectors | **Done (CLI):** `calyx onboard` / `sources create` — see [`ONBOARDING_CLI.md`](./ONBOARDING_CLI.md) |
| GitHub App + commit/deploy markers | connectors | **Thin webhook done** (`github connect` + `/v1/webhooks/github/:id`); full App OAuth later |
| Autonomous Slack cards | detection + Slack | **Channel bind + `slack test` done**; detector→card loop still open |
| Act II (restart / rollback) | execution + approval | **Never** expose write tools until approval gate exists |

---

## 4. Tenant & identity (read carefully)

Two IDs today — don’t mix them up:

| ID | System | Used by |
|---|---|---|
| `tenant_id` (string) | Postgres events, MCP keys, `/v1/ask` | Observability truth |
| Convex `workspaceId` | Chat UI membership | Messaging only |

Web currently hardcodes `NEXT_PUBLIC_CALYX_TENANT_ID ?? 'default'`. MCP keys are **per tenant**. Until workspace↔tenant linking ships, MCP keys are the product for IDE users.

---

## 5. Architecture contract (MCP ↔ everyone else)

```
IDE agent  ──MCP tools──►  src/mcp/server.ts
                              │
                              ▼
                         agent tool registry  ◄── Slack / CLI / web ask
                              │
                              ▼
                         storage + (later) GitHub / detectors
```

**Rules:**

1. **One registry.** If a capability isn’t in `src/agent/tools`, it isn’t an MCP tool.  
2. **Read-only in Act I.** No restarts, no PR merges, no DLQ purge via MCP yet.  
3. **Charts are optional hints.** MCP returns data; IDE agents render markdown/tables. Don’t depend on web Chart.js.  
4. **Alert → IDE handoff** should be a URL or alert id the agent can pass into `ask` / `query_logs`, not a second notification system.

---

## 6. Golden path to demo (use this in PRs)

```bash
# Infra
docker compose up -d postgres redis
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx npm run migrate

# Ingest a burst of 404s for tenant `default` (use existing fixtures / POST /v1/logs)

# MCP key (shown once)
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
  npm run mcp:key -- create --tenant default --name "codex-dev" --scopes logs:read,incidents:read,incidents:ask

# HTTP MCP
MCP_PORT=13002 npm run dev:mcp:http
# → http://127.0.0.1:13002/mcp
```

**Claude Code**

```bash
claude mcp add --scope project --transport http calyx http://127.0.0.1:13002/mcp \
  --header "Authorization: Bearer $CALYX_API_KEY"
```

**Codex**

```bash
codex mcp add calyx --url http://127.0.0.1:13002/mcp \
  --bearer-token-env-var CALYX_API_KEY
```

**Prompt to prove it:**

> Our checkout frontend and API both ship logs to Calyx. Users report 404s. Using Calyx MCP only: which service is erroring, show 5 sample log lines, and say whether this looks like a deploy or a client bug.

---

## 7. Suggested first PR split

| PR | Scope | Done when |
|---|---|---|
| **PR1** | Hardening + docs + smoke script for 4 tools on Claude + Codex | Golden path §6 works on a clean machine |
| **PR2** | `ask` tool + `incidents:ask` scope wired | Same question works via MCP ask and `/calyx` ask |
| **PR3** | `list_services` + better error messages / empty-tenant UX | New tenant with no logs fails clearly |

---

## 8. Out of scope for MCP friend (explicit)

- Building the Calyx web gallery / chart components  
- Convex schema / Slack message UI  
- Act II write actions  
- Replacing detection with LLM-only alerts  

If blocked on ingest or tenant linking, ping the owner of `src/ingestion` — don’t fork a parallel log store.

---

## 9. Quick file map

```
src/mcp/server.ts          # stdio MCP + tool registration
src/mcp/http-server.ts     # Streamable HTTP
src/mcp/auth.ts            # API keys + scopes
src/mcp/keys-cli.ts        # npm run mcp:key
src/agent/index.ts         # tool registry (shared)
src/agent/tools/           # implementations
src/ingestion/routes/v1/   # /v1/logs, /v1/ask
docs/MCP_CONNECTORS.md     # client install snippets
docs/MCP_BASELINE.md       # this file
```

---

*Last updated for handoff: keep Phase 0 green before inventing new tools. Flow over features.*
