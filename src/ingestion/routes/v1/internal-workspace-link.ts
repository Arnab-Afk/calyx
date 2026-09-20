import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorizeInternal } from "../../internal-auth.js";
import { linkWorkspaceToTenant, tenantForWorkspace } from "../../../storage/workspace-tenants.js";

const Body = z.object({
  tenantId: z.string().trim().min(1).max(120).optional(),
});

export async function internalWorkspaceLinkRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/internal/workspaces/:workspaceId/link", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const { workspaceId } = request.params as { workspaceId: string };
    const parsed = Body.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });
    const tenantId = parsed.data.tenantId?.trim() || process.env.CALYX_DEFAULT_TENANT?.trim() || "default";

    try {
      await linkWorkspaceToTenant(workspaceId, tenantId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "link failed";
      return reply.status(409).send({ error: message });
    }

    return {
      workspaceId,
      tenantId,
      linked: true,
    };
  });

  app.get("/v1/internal/workspaces/:workspaceId/link", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const { workspaceId } = request.params as { workspaceId: string };
    const tenantId = await tenantForWorkspace(workspaceId);
    if (!tenantId) return reply.status(404).send({ error: "Workspace is not linked" });
    return { workspaceId, tenantId };
  });
}
