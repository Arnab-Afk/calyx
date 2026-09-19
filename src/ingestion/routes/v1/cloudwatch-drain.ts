import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bearerToken } from "../../../mcp/auth.js";
import { authenticateSourceToken, touchLogSource } from "../../../storage/projects.js";
import { normalizeCloudWatchEnvelope } from "../../cloudwatch-normalize.js";
import { enqueueEvents } from "../../queue.js";

const Body = z.object({ awslogs: z.object({ data: z.string().min(1) }) });

export async function cloudWatchDrainRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/drains/cloudwatch/:sourceId", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const source = token?.startsWith("calyx_src_") ? await authenticateSourceToken(token) : null;
    if (!source) return reply.status(401).send({ error: "Invalid source write token" });
    const { sourceId } = request.params as { sourceId: string };
    if (source.sourceId !== sourceId || source.provider !== "cloudwatch") {
      return reply.status(403).send({ error: "Source token does not match CloudWatch source" });
    }
    const body = Body.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: "Invalid CloudWatch envelope" });
    try {
      const events = normalizeCloudWatchEnvelope(body.data.awslogs.data, {
        tenantId: source.tenantId,
        projectId: source.projectId,
        sourceId: source.sourceId,
        service: source.service,
        role: source.role,
      });
      if (events.length > 0) await enqueueEvents(events);
      await touchLogSource(source.sourceId);
      return reply.status(202).send({ received: events.length });
    } catch (error) {
      return reply.status(422).send({
        error: error instanceof Error ? error.message : "Invalid CloudWatch payload",
      });
    }
  });
}
