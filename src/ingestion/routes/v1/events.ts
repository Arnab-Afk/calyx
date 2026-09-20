import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateMgmtKey,
  bearerToken,
  requireScope,
} from "../../../mgmt/auth.js";
import { queryEvents } from "../../../storage/events.js";

export async function eventsRoute(app: FastifyInstance): Promise<void> {
  app.get("/v1/events", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: "Missing Authorization Bearer token" });
    }
    const principal = await authenticateMgmtKey(token);
    if (!principal) {
      return reply.status(401).send({ error: "Invalid management token" });
    }
    if (!requireScope(principal, "projects:write")) {
      return reply.status(403).send({ error: "Missing scope projects:write" });
    }

    const query = z
      .object({
        service: z.string().optional(),
        level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: "Validation failed", issues: query.error.issues });
    }

    const events = await queryEvents({
      tenant_id: principal.tenantId,
      service: query.data.service,
      level: query.data.level,
      limit: query.data.limit ?? 50,
    });

    return { events };
  });
}
