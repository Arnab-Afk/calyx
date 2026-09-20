import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorizeInternal } from "../../internal-auth.js";
import { bearerToken } from "../../../mcp/auth.js";
import { authenticateMgmtKey } from "../../../mgmt/auth.js";
import {
  linkWorkspaceToTenant,
  projectScopeForWorkspace,
  setWorkspaceProjectScope,
  tenantForWorkspace,
} from "../../../storage/workspace-tenants.js";

const Body = z.object({
  tenantId: z.string().trim().min(1).max(120).optional(),
});

const ScopeBody = z.object({
  hostWorkspaceId: z.string().trim().min(1),
  projectId: z.string().uuid(),
  projectSlug: z.string().trim().min(1).max(120),
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

  app.post("/v1/internal/workspaces/:workspaceId/project-scope", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const { workspaceId } = request.params as { workspaceId: string };
    const parsed = ScopeBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.flatten() });

    const tenantId = await tenantForWorkspace(workspaceId);
    if (!tenantId) return reply.status(404).send({ error: "Workspace is not linked" });

    const scope = await setWorkspaceProjectScope({
      workspaceId,
      tenantId,
      projectId: parsed.data.projectId,
      projectSlug: parsed.data.projectSlug,
      hostWorkspaceId: parsed.data.hostWorkspaceId,
    });
    return { scope };
  });

  app.get("/v1/internal/workspaces/:workspaceId/authorize-management", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const token = bearerToken(request.headers.authorization);
    const principal = token ? await authenticateMgmtKey(token) : null;
    if (!principal) return reply.status(401).send({ error: "Invalid management credential" });

    const { workspaceId } = request.params as { workspaceId: string };
    const tenantId = await tenantForWorkspace(workspaceId);
    if (!tenantId || tenantId !== principal.tenantId) {
      return reply.status(403).send({ error: "Management credential does not belong to this workspace" });
    }
    const scope = await projectScopeForWorkspace(workspaceId);
    return {
      authorized: true,
      projectScope: scope
        ? {
            projectId: scope.projectId,
            projectSlug: scope.projectSlug,
            hostWorkspaceId: scope.hostWorkspaceId,
          }
        : null,
    };
  });
}
