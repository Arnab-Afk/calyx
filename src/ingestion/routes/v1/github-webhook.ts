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
    } else if (eventName === "pull_request") {
      const action = String(body.action ?? "updated");
      const pr = (body.pull_request as Record<string, unknown> | undefined) ?? {};
      const user = (pr.user as { login?: string } | undefined)?.login
        ?? (body.sender as { login?: string } | undefined)?.login
        ?? "unknown";
      const merged = pr.merged === true;
      const number = pr.number != null ? String(pr.number) : "";
      const title = String(pr.title ?? "pull request");
      const url = typeof pr.html_url === "string" ? pr.html_url : undefined;
      const baseRef = (pr.base as { ref?: string } | undefined)?.ref;
      const headRef = (pr.head as { ref?: string } | undefined)?.ref;
      const sha = typeof pr.merge_commit_sha === "string"
        ? pr.merge_commit_sha
        : typeof (pr.head as { sha?: string } | undefined)?.sha === "string"
          ? (pr.head as { sha: string }).sha
          : undefined;

      if (merged && sha) {
        await upsertGithubCommits([{
          tenantId: conn.tenantId,
          projectId,
          repo: conn.repo,
          sha,
          ref: baseRef ? `refs/heads/${baseRef}` : undefined,
          message: `Merge pull request #${number}: ${title}`,
          author: user,
          committedAt: String(pr.merged_at ?? pr.closed_at ?? now),
          url,
        }]);
      }

      events.push({
        tenant_id: conn.tenantId,
        timestamp: String(pr.updated_at ?? pr.closed_at ?? pr.created_at ?? now),
        service: "github",
        level: "info",
        message: merged
          ? `merged PR #${number}: ${title}`
          : `PR #${number} ${action}: ${title}`,
        attributes: {
          source: "github_webhook",
          repo: conn.repo,
          project_id: projectId,
          event: "pull_request",
          pr_action: action,
          action,
          merged,
          number,
          title,
          author: user,
          actor: user,
          sha,
          ref: headRef ?? baseRef,
          url,
        },
      });
    } else if (eventName === "release") {
      const action = String(body.action ?? "published");
      const release = (body.release as Record<string, unknown> | undefined) ?? {};
      const tag = String(release.tag_name ?? "");
      const name = String(release.name ?? (tag || "release"));
      events.push({
        tenant_id: conn.tenantId,
        timestamp: String(release.published_at ?? release.created_at ?? now),
        service: "github",
        level: "info",
        message: `release ${action}: ${name}`,
        attributes: {
          source: "github_webhook",
          repo: conn.repo,
          project_id: projectId,
          event: "release",
          action,
          ref: tag,
          url: typeof release.html_url === "string" ? release.html_url : undefined,
          author: (release.author as { login?: string } | undefined)?.login,
        },
      });
    } else if (eventName === "create" || eventName === "delete") {
      const refType = String(body.ref_type ?? "ref");
      const ref = String(body.ref ?? "");
      events.push({
        tenant_id: conn.tenantId,
        timestamp: now,
        service: "github",
        level: "info",
        message: `${eventName} ${refType} ${ref}`.trim(),
        attributes: {
          source: "github_webhook",
          repo: conn.repo,
          project_id: projectId,
          event: eventName,
          ref,
          author: (body.sender as { login?: string } | undefined)?.login,
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
