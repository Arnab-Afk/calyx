import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EventLevel } from "../../../schemas/index.js";
import { enqueueEvents } from "../../queue.js";
import { authenticateSourceToken, touchLogSource } from "../../../storage/projects.js";
import { bearerToken } from "../../../mcp/auth.js";

const IngestEventSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  timestamp: z.string().datetime({ offset: true }),
  service: z.string().min(1).optional(),
  level: EventLevel,
  message: z.string().min(1),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  attributes: z.record(z.unknown()).optional().default({}),
});

const BatchSchema = z.union([
  IngestEventSchema,
  z.array(IngestEventSchema).min(1).max(1000),
]);

export async function logsRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/logs", async (request, reply) => {
    const headerTenant = (request.headers["x-tenant-id"] as string | undefined)?.trim();
    const token = bearerToken(request.headers.authorization);
    let source = null as Awaited<ReturnType<typeof authenticateSourceToken>>;

    if (token?.startsWith("calyx_src_")) {
      source = await authenticateSourceToken(token);
      if (!source) {
        return reply.status(401).send({ error: "Invalid source write token" });
      }
    }

    if (!source && !headerTenant) {
      return reply.status(400).send({
        error: "Provide Authorization: Bearer <source_token> or X-Tenant-ID header",
      });
    }

    const parsed = BatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "Validation failed",
        issues: parsed.error.issues,
      });
    }

    const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    const tenantId = source?.tenantId ?? headerTenant!;

    const stamped = events.map((e) => ({
      tenant_id: tenantId,
      timestamp: e.timestamp,
      service: e.service ?? source?.service ?? "unknown",
      level: e.level,
      message: e.message,
      trace_id: e.trace_id,
      span_id: e.span_id,
      attributes: {
        ...e.attributes,
        ...(source
          ? {
              source_id: source.sourceId,
              project_id: source.projectId,
              source_role: source.role,
            }
          : {}),
      },
    }));

    await enqueueEvents(stamped);

    if (source) {
      await touchLogSource(source.sourceId);
    }

    return reply.status(202).send({ received: stamped.length });
  });
}
