# CloudWatch Logs ingestion

**Date:** 2026-09-20

## Built

- Added a source-token-authenticated CloudWatch Logs drain.
- Decoded bounded AWS gzip/base64 subscription envelopes into the shared event model.
- Derived tenant, project, service, and role from the authenticated source rather than payload input.
- Preserved AWS account, log group, stream, event ID, and subscription-filter evidence.
- Added JSON/plain-text level inference and control-message handling.
- Added CloudWatch source creation/listing support to the management API and CLI.
- Added forwarding Lambda and onboarding documentation.
- Recorded successful publication of `calyx-mcp@0.1.0`.

## Verification

- Full suite: 192 passed, 3 provider-dependent skipped.
- Modified-slice TypeScript diagnostics are clear.
- Compose and diff checks pass.

## Next

Complete GitHub App authentication and deployment/commit correlation.
