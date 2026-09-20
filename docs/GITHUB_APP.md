# GitHub App installation

Calyx uses a GitHub App for repository reads, draft pull-request creation, and signed webhook ingestion. Users cannot submit an installation ID directly.

## App configuration

Configure the GitHub App with:

- Setup URL: `https://<calyx-api>/v1/github/install/callback`
- Repository permissions: Contents read/write, Pull requests read/write, Webhooks read/write, Metadata read
- Subscribe to push, deployment, and deployment status events
- Installation target: selected repositories (recommended)

Set `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, and the server-only `GITHUB_APP_PRIVATE_KEY`. `CALYX_PUBLIC_URL` must be the externally reachable Node API origin.

## Installation flow

1. A workspace admin calls `POST /v1/projects/:id/github` with `{"repo":"owner/repo"}` through the authenticated operations proxy.
2. Calyx creates a random, hashed, ten-minute state bound to the management tenant, project, and repository.
3. The browser follows the returned GitHub installation URL.
4. GitHub redirects to the setup URL with `installation_id` and state.
5. Calyx atomically consumes state, asks GitHub which installation owns the selected repository, and requires an exact installation match.
6. Calyx creates or updates the repository webhook with a new random signing secret.
7. Only after successful validation and webhook provisioning does Calyx persist the repository and installation ID.

State is single-use and cannot be replayed. Failed provisioning requires restarting the flow. The webhook secret and App private key are never returned to browser code.

`DELETE /v1/projects/:id/github` removes the matching repository webhook where possible and always removes the local connection, including when the installation was already revoked.
