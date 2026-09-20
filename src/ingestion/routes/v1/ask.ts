import type { FastifyInstance } from "fastify";

/**
 * Compatibility tombstone for the former caller-selected tenant endpoint.
 * Trusted web callers must use the internal workspace route, which resolves
 * tenant identity from PostgreSQL.
 */
export async function askRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/ask", async (_request, reply) =>
    reply.status(410).send({
      error: "This endpoint no longer accepts caller-selected tenants",
      replacement: "/v1/internal/workspaces/:workspaceId/ask",
    })
  );
}
