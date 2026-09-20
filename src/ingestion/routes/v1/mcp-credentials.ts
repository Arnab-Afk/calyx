import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createApiKey, listApiKeys, MCP_SCOPES, revokeApiKey } from "../../../mcp/auth.js";
import { authorizeInternal, resolveWorkspaceTenant } from "../../internal-auth.js";

const WorkspaceSchema = z.string().min(1).max(200);
const CreateSchema = z.object({
  workspaceId: WorkspaceSchema,
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).default(["logs:read"]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
const ListSchema = z.object({ workspaceId: WorkspaceSchema });
const RevokeSchema = z.object({ workspaceId: WorkspaceSchema, credentialId: z.string().uuid() });

export async function mcpCredentialsRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/mcp/credentials/list", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const parsed = ListSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });
    const tenantId = await resolveWorkspaceTenant(parsed.data.workspaceId, reply);
    if (!tenantId) return;
    return { credentials: await listApiKeys(tenantId) };
  });

  app.post("/v1/mcp/credentials/create", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });
    const tenantId = await resolveWorkspaceTenant(parsed.data.workspaceId, reply);
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
    const tenantId = await resolveWorkspaceTenant(parsed.data.workspaceId, reply);
    if (!tenantId) return;
    const revoked = await revokeApiKey(parsed.data.credentialId, tenantId);
    if (!revoked) return reply.status(404).send({ error: "Active credential not found" });
    return { revoked: true };
  });
}
