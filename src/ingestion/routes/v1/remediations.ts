import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { approveAction, rejectAction } from "../../../execution/executor.js";
import { initExecution } from "../../../execution/index.js";
import {
  authenticateMgmtKey,
  bearerToken,
  requireScope,
  type MgmtPrincipal,
} from "../../../mgmt/auth.js";
import {
  getRemediationRequest,
  listRemediationRequests,
  type RemediationStatus,
} from "../../../storage/remediations.js";
import { authorizeInternal } from "../../internal-auth.js";

const Status = z.enum([
  "pending",
  "executing",
  "executed",
  "failed",
  "rejected",
  "undoing",
  "undone",
]);
const Decision = z.object({ reason: z.string().trim().min(1).max(2000) });

async function requireRemediationPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<MgmtPrincipal | null> {
  const token = bearerToken(request.headers.authorization);
  const principal = token ? await authenticateMgmtKey(token) : null;
  if (!principal) {
    await reply.status(401).send({ error: "Invalid management token" });
    return null;
  }
  if (!requireScope(principal, "integrations:write")) {
    await reply.status(403).send({ error: "Missing scope integrations:write" });
    return null;
  }
  return principal;
}

function decisionActor(
  request: FastifyRequest,
  reply: FastifyReply,
  principal: MgmtPrincipal,
): string | null {
  const raw = request.headers["x-calyx-actor-id"];
  const actor = Array.isArray(raw) ? raw[0] : raw;
  if (!actor) return `mgmt:${principal.credentialId}`;
  if (!authorizeInternal(request, reply)) return null;
  if (!actor.startsWith("web:") || actor.length > 500) {
    void reply.status(422).send({ error: "Invalid internal actor identity" });
    return null;
  }
  return actor;
}

export async function remediationsRoute(app: FastifyInstance): Promise<void> {
  initExecution();

  app.get("/v1/remediations", async (request, reply) => {
    const principal = await requireRemediationPrincipal(request, reply);
    if (!principal) return;
    const parsed = z
      .object({
        status: Status.optional(),
        incidentId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });
    return {
      remediations: await listRemediationRequests(principal.tenantId, {
        status: parsed.data.status as RemediationStatus | undefined,
        incidentId: parsed.data.incidentId,
        limit: parsed.data.limit,
      }),
    };
  });

  app.get("/v1/remediations/:requestId", async (request, reply) => {
    const principal = await requireRemediationPrincipal(request, reply);
    if (!principal) return;
    const { requestId } = request.params as { requestId: string };
    const remediation = await getRemediationRequest(
      requestId,
      principal.tenantId,
    );
    if (!remediation)
      return reply.status(404).send({ error: "Remediation request not found" });
    return { remediation };
  });

  app.post("/v1/remediations/:requestId/approve", async (request, reply) => {
    const principal = await requireRemediationPrincipal(request, reply);
    if (!principal) return;
    const actor = decisionActor(request, reply, principal);
    if (!actor) return;
    const parsed = Decision.safeParse(request.body);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });
    const { requestId } = request.params as { requestId: string };
    if (!(await getRemediationRequest(requestId, principal.tenantId))) {
      return reply.status(404).send({ error: "Remediation request not found" });
    }
    try {
      return await approveAction({
        requestId,
        approvedBy: actor,
        reason: parsed.data.reason,
      });
    } catch (error) {
      return reply
        .status(409)
        .send({
          error: error instanceof Error ? error.message : String(error),
        });
    }
  });

  app.post("/v1/remediations/:requestId/reject", async (request, reply) => {
    const principal = await requireRemediationPrincipal(request, reply);
    if (!principal) return;
    const actor = decisionActor(request, reply, principal);
    if (!actor) return;
    const parsed = Decision.safeParse(request.body);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });
    const { requestId } = request.params as { requestId: string };
    if (!(await getRemediationRequest(requestId, principal.tenantId))) {
      return reply.status(404).send({ error: "Remediation request not found" });
    }
    try {
      const remediation = await rejectAction({
        requestId,
        rejectedBy: actor,
        reason: parsed.data.reason,
      });
      return { remediation };
    } catch (error) {
      return reply
        .status(409)
        .send({
          error: error instanceof Error ? error.message : String(error),
        });
    }
  });
}
