import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getGithubConnection } from "../../../storage/projects.js";
import { enqueueEvents } from "../../queue.js";
import type { Event } from "../../../schemas/index.js";
import { upsertGithubCommits, upsertGithubDeployment } from "../../../storage/github.js";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyGithubSignature(secret: string, rawBody: string, signature: string | undefined): boolean {
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
      const durableCommits = commits.slice(0, 100).map((c) => ({
        tenantId: conn.tenantId,
        projectId,
        repo: conn.repo,
        sha: String(c.id),
        ref,
        message: String(c.message ?? ""),
        author: String((c.author as { username?: string; name?: string } | undefined)?.username ??
          (c.author as { name?: string } | undefined)?.name ?? pusher),
        committedAt: String(c.timestamp ?? now),
        url: typeof c.url === "string" ? c.url : undefined,
      }));
      if (durableCommits.length > 0) await upsertGithubCommits(durableCommits);
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
      const deploymentStatus = body.deployment_status as Record<string, unknown> | undefined;
      if (deployment.id === undefined || deployment.id === null) {
        return reply.status(422).send({ error: "GitHub deployment is missing id" });
      }
      const state = String(deploymentStatus?.state ?? "created");
      const deployedAt = String(deploymentStatus?.created_at ?? deployment.created_at ?? now);
      await upsertGithubDeployment({
        tenantId: conn.tenantId,
        projectId,
        repo: conn.repo,
        deploymentId: String(deployment.id),
        sha: typeof deployment.sha === "string" ? deployment.sha : undefined,
        ref: typeof deployment.ref === "string" ? deployment.ref : undefined,
        environment: typeof deployment.environment === "string" ? deployment.environment : undefined,
        status: state,
        description: typeof deploymentStatus?.description === "string" ? deploymentStatus.description : undefined,
        targetUrl: typeof deploymentStatus?.target_url === "string" ? deploymentStatus.target_url : undefined,
        deployedAt,
      });
      events.push({
        tenant_id: conn.tenantId,
        timestamp: deployedAt,
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
