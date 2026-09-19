import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getGithubConnection } from "../../../storage/projects.js";
import { enqueueEvents } from "../../queue.js";
import type { Event } from "../../../schemas/index.js";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyGithubSignature(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return timingSafeEqualStr(expected, signature);
}

/** Encapsulated so the raw-body JSON parser does not affect other routes. */
export async function githubWebhookRoute(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        const raw = body.toString("utf8");
        (req as { rawBody?: string }).rawBody = raw;
        done(null, raw ? JSON.parse(raw) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.post("/v1/webhooks/github/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const conn = await getGithubConnection(projectId);
    if (!conn) return reply.status(404).send({ error: "Unknown project webhook" });

    const rawBody = (request as { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? {});
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    if (!verifyGithubSignature(conn.webhookSecret, rawBody, signature)) {
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const eventName = (request.headers["x-github-event"] as string | undefined) ?? "unknown";
    const body = request.body as Record<string, unknown>;

    const events: Event[] = [];
    const now = new Date().toISOString();

    if (eventName === "push") {
      const commits = (body.commits as Array<Record<string, unknown>> | undefined) ?? [];
      const ref = String(body.ref ?? "");
      const pusher = (body.pusher as { name?: string } | undefined)?.name ?? "unknown";
      for (const c of commits.slice(0, 20)) {
        events.push({
          tenant_id: conn.tenantId,
          timestamp: String(c.timestamp ?? now),
          service: "github",
          level: "info",
          message: `push ${String(c.id).slice(0, 7)}: ${String(c.message ?? "").split("\n")[0]}`,
          attributes: {
            source: "github_webhook",
            repo: conn.repo,
            sha: c.id,
            ref,
            author: pusher,
            project_id: projectId,
          },
        });
      }
      if (commits.length === 0) {
        events.push({
          tenant_id: conn.tenantId,
          timestamp: now,
          service: "github",
          level: "info",
          message: `push on ${ref}`,
          attributes: {
            source: "github_webhook",
            repo: conn.repo,
            ref,
            author: pusher,
            project_id: projectId,
          },
        });
      }
    } else if (eventName === "deployment_status" || eventName === "deployment") {
      const deployment = (body.deployment as Record<string, unknown> | undefined) ?? body;
      const state = String(
        (body.deployment_status as { state?: string } | undefined)?.state ??
          deployment.environment ??
          "unknown"
      );
      events.push({
        tenant_id: conn.tenantId,
        timestamp: now,
        service: "github",
        level: state === "failure" || state === "error" ? "error" : "info",
        message: `deploy ${state}: ${conn.repo}`,
        attributes: {
          source: "github_webhook",
          repo: conn.repo,
          sha: deployment.sha,
          environment: deployment.environment,
          project_id: projectId,
          event: eventName,
        },
      });
    } else if (eventName === "ping") {
      return reply.send({ ok: true, pong: true });
    } else {
      events.push({
        tenant_id: conn.tenantId,
        timestamp: now,
        service: "github",
        level: "info",
        message: `github.${eventName}`,
        attributes: {
          source: "github_webhook",
          repo: conn.repo,
          project_id: projectId,
          event: eventName,
        },
      });
    }

    if (events.length > 0) await enqueueEvents(events);
    return reply.status(202).send({ received: events.length, event: eventName });
  });
}
