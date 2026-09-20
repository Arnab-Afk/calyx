import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { linkWorkspaceToTenant, tenantForWorkspace } from "../storage/workspace-tenants.js";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function authorizeInternal(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.CALYX_INTERNAL_API_KEY;
  if (!expected) {
    reply.status(503).send({ error: "Internal API is not configured" });
    return false;
  }
  const supplied = request.headers["x-calyx-internal-key"];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  if (!value || !safeEqual(value, expected)) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export async function resolveWorkspaceTenant(
  workspaceId: string,
  reply: FastifyReply
): Promise<string | null> {
  let tenantId = await tenantForWorkspace(workspaceId);
  if (!tenantId) {
    const autoTenant =
      process.env.CALYX_TENANT_ID?.trim() || process.env.CALYX_DEFAULT_TENANT?.trim();
    if (!autoTenant) {
      await reply.status(409).send({ error: "Workspace is not linked to a Calyx tenant" });
      return null;
    }
    try {
      await linkWorkspaceToTenant(workspaceId, autoTenant);
      tenantId = autoTenant;
    } catch {
      await reply.status(409).send({ error: "Workspace is not linked to a Calyx tenant" });
      return null;
    }
  }
  return tenantId;
}
