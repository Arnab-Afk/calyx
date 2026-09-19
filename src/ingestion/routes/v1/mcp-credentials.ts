import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createApiKey, listApiKeys, MCP_SCOPES, revokeApiKey } from "../../../mcp/auth.js";
import { tenantForWorkspace } from "../../../storage/workspace-tenants.js";

const WorkspaceSchema = z.string().min(1).max(200);
const CreateSchema = z.object({
  workspaceId: WorkspaceSchema,
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).default(["logs:read"]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
const ListSchema = z.object({ workspaceId: WorkspaceSchema });
const RevokeSchema = z.object({ workspaceId: WorkspaceSchema, credentialId: z.string().uuid() });

async function resolveTenant(workspaceId: string, reply: FastifyReply): Promise<string | null> {
  const tenantId = await tenantForWorkspace(workspaceId);
  if (!tenantId) {
    await reply.status(409).send({ error: "Workspace is not linked to a Calyx tenant" });
    return null;
  }
  return tenantId;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorizeInternal(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.CALYX_INTERNAL_API_KEY;
  if (!expected) {
    reply.status(503).send({ error: "Internal credential API is not configured" });
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

export async function mcpCredentialsRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/mcp/credentials/list", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const parsed = ListSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });
    const tenantId = await resolveTenant(parsed.data.workspaceId, reply);
    if (!tenantId) return;
    return { credentials: await listApiKeys(tenantId) };
  });

  app.post("/v1/mcp/credentials/create", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });
    const tenantId = await resolveTenant(parsed.data.workspaceId, reply);
    if (!tenantId) return;
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
      : undefined;
    const credential = await createApiKey({
      tenantId,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      ...(expiresAt && { expiresAt }),
    });
    return reply.status(201).send({ credential });
  });

  app.post("/v1/mcp/credentials/revoke", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const parsed = RevokeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });
    const tenantId = await resolveTenant(parsed.data.workspaceId, reply);
    if (!tenantId) return;
    const revoked = await revokeApiKey(parsed.data.credentialId, tenantId);
    if (!revoked) return reply.status(404).send({ error: "Active credential not found" });
    return { revoked: true };
  });
}
