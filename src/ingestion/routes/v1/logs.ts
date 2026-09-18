import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EventSchema } from "../../../schemas/index.js";
import { enqueueEvents } from "../../queue.js";

// Accept a single event or a batch
const BatchSchema = z.union([EventSchema, z.array(EventSchema).min(1).max(1000)]);

export async function logsRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/logs", async (request, reply) => {
    const tenantId = (request.headers["x-tenant-id"] as string | undefined)?.trim();
    if (!tenantId) {
      return reply.status(400).send({ error: "Missing X-Tenant-ID header" });
    }

    const parsed = BatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "Validation failed",
        issues: parsed.error.issues,
      });
    }

    const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    // Stamp tenant_id from the header — the body field is accepted too but
    // the header wins, so a single routing key always controls tenant isolation.
    const stamped = events.map((e) => ({ ...e, tenant_id: tenantId }));

    await enqueueEvents(stamped);

    return reply.status(202).send({ received: stamped.length });
  });
}
