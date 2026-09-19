# Deployment-safe MCP sessions

**Date:** 2026-09-19

## Built

- Made stateless Streamable HTTP the hosted default.
- Created and disposed an isolated scoped MCP protocol server for every POST.
- Retained explicit stateful mode for single-instance or load-balancer-affinity deployments.
- Exposed session mode in health output and documented POST-only/stateless trade-offs.
- Confirmed teammate publication of `calyx-logger@0.2.0` on npm.

## Verification

- Official MCP SDK clients connect, discover tools, and invoke tools in stateless mode.
- Explicit stateful mode retains the existing session behavior.
- Root suite, filtered TypeScript, Compose, and diff checks pass.

## Next

Package a standalone local stdio-to-hosted-Calyx connector so IDE users do not need a repository checkout.
