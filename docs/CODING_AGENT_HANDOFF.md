# Coding-agent pull-request handoff

Calyx treats generated code as a review proposal. Coding agents can create draft pull requests; they cannot merge or deploy.

## Prerequisites

- The incident and project belong to the authenticated management tenant.
- The project has a GitHub connection with a verified GitHub App installation ID. The App installation grants repository Contents read/write and Pull requests read/write permissions, but Calyx does not request merge or deployment authority.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `CALYX_CODING_AGENT_URL`, and `CALYX_PUBLIC_URL` are configured server-side.
- The management credential has `integrations:write`.

A launch fails closed if any prerequisite is missing. Calyx stores only a SHA-256 digest of the single-job callback capability.

## Dispatcher contract

`POST /v1/coding-jobs` creates a durable job and sends this server-to-server payload to `CALYX_CODING_AGENT_URL`:

```json
{
  "job": {
    "id": "uuid",
    "incidentId": "uuid",
    "repo": "owner/repo",
    "objective": "Fix the verified failure and add a regression test"
  },
  "callback": {
    "url": "https://calyx.example/v1/coding-jobs/<id>/submit",
    "token": "calyx_job_..."
  }
}
```

The capability is scoped to that job and becomes unusable when submission starts. The agent can inspect code without receiving a GitHub token:

- `GET /v1/coding-jobs/:id/search?q=...`
- `GET /v1/coding-jobs/:id/files?path=...&ref=...`

Both require `Authorization: Bearer <callback token>`. Searches return at most 25 paths and files are capped at 1 MiB.

## Submission

The agent submits 1–50 complete file contents, totaling at most 512 KiB:

```json
{
  "title": "Fix checkout nil dereference",
  "body": "Evidence, approach, and tests performed",
  "files": [{ "path": "src/checkout.ts", "content": "..." }]
}
```

Calyx obtains a short-lived GitHub installation token, creates blobs/tree/commit, creates `calyx/<job-id>`, and opens a **draft** pull request. It persists the branch, PR number, URL, failures, and append-only job events linked to the incident. There is no merge endpoint or merge API call.

External coding-agent execution remains the dispatcher’s sandbox responsibility. It should use an isolated runtime, bound CPU/time/network, and run repository tests before submission.
