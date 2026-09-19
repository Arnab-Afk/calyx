import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateMgmtKey,
  bearerToken,
  requireScope,
  type MgmtPrincipal,
} from "../../../mgmt/auth.js";
import {
  createLogSource,
  createProject,
  getGithubConnection,
  getProject,
  getSlackBinding,
  listLogSources,
  listProjects,
  upsertGithubConnection,
  upsertSlackBinding,
  type SourceRole,
} from "../../../storage/projects.js";
import { buildAlertCard } from "../../../slack/alert-card.js";
import type { Alert } from "../../../schemas/index.js";
import { WebClient } from "@slack/web-api";

declare module "fastify" {
  interface FastifyRequest {
    mgmt?: MgmtPrincipal;
  }
}

async function requireMgmt(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: "projects:write" | "sources:write" | "integrations:write"
): Promise<MgmtPrincipal | null> {
  const token = bearerToken(request.headers.authorization);
  if (!token) {
    await reply.status(401).send({ error: "Missing Authorization Bearer token" });
    return null;
  }
  const principal = await authenticateMgmtKey(token);
  if (!principal) {
    await reply.status(401).send({ error: "Invalid management token" });
    return null;
  }
  if (!requireScope(principal, scope)) {
    await reply.status(403).send({ error: `Missing scope ${scope}` });
    return null;
  }
  request.mgmt = principal;
  return principal;
}

function intakeBaseUrl(_request: unknown): string {
  return (
    process.env.CALYX_INTAKE_URL?.replace(/\/$/, "") ||
    process.env.CALYX_PUBLIC_URL?.replace(/\/$/, "") ||
    `http://127.0.0.1:${process.env.PORT ?? "13000"}`
  );
}

export async function projectsRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/projects", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "projects:write");
    if (!principal) return;

    const body = z
      .object({
        name: z.string().min(1).max(120),
        environment: z.string().min(1).max(64).optional(),
        slug: z.string().min(1).max(64).optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: "Validation failed", issues: body.error.issues });
    }

    const project = await createProject({
      tenantId: principal.tenantId,
      name: body.data.name,
      environment: body.data.environment,
      slug: body.data.slug,
    });
    return reply.status(201).send(project);
  });

  app.get("/v1/projects", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "projects:write");
    if (!principal) return;
    return reply.send({ projects: await listProjects(principal.tenantId) });
  });

  app.post("/v1/projects/:id/sources", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "sources:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const body = z
      .object({
        name: z.string().min(1).max(120),
        role: z.enum(["frontend", "backend", "other"]),
        service: z.string().min(1).max(120),
        provider: z.enum(["http", "vercel", "cloudwatch"]).optional().default("http"),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: "Validation failed", issues: body.error.issues });
    }

    const source = await createLogSource({
      projectId: project.id,
      tenantId: principal.tenantId,
      name: body.data.name,
      role: body.data.role as SourceRole,
      service: body.data.service,
      provider: body.data.provider,
    });

    const intake = intakeBaseUrl(request);

    if (body.data.provider === "vercel") {
      const drainUrl = `${intake}/v1/drains/vercel/${source.id}`;
      return reply.status(201).send({
        source: {
          id: source.id,
          projectId: source.projectId,
          name: source.name,
          role: source.role,
          service: source.service,
          provider: source.provider,
          lastEventAt: source.lastEventAt,
          createdAt: source.createdAt,
        },
        drainUrl,
        drainSecret: source.drainSecret,
        nextSteps: [
          "Vercel → Team Settings → Drains → Add Drain → Custom Endpoint",
          `Endpoint URL: ${drainUrl}`,
          "Format: JSON (or NDJSON)",
          `Signature Verification Secret: (shown once below as drainSecret)`,
          "Sources: lambda + edge (+ build if useful); Environments: production (and preview if wanted)",
          "Save the drain — Vercel will POST a verify probe; Calyx echoes x-vercel-verify automatically",
          `Then: calyx sources status --project ${project.slug} --wait 60`,
        ],
      });
    }

    if (body.data.provider === "cloudwatch") {
      const drainUrl = `${intake}/v1/drains/cloudwatch/${source.id}`;
      return reply.status(201).send({
        source: {
          id: source.id,
          projectId: source.projectId,
          name: source.name,
          role: source.role,
          service: source.service,
          provider: source.provider,
          lastEventAt: source.lastEventAt,
          createdAt: source.createdAt,
        },
        drainUrl,
        token: source.token,
        nextSteps: [
          "Create a CloudWatch Logs subscription filter targeting a forwarding Lambda",
          `Configure CALYX_CLOUDWATCH_URL=${drainUrl} on the forwarder`,
          "Configure CALYX_SOURCE_TOKEN with the token shown once in this response",
          `Then: calyx sources status --project ${project.slug} --wait 60`,
        ],
      });
    }

    return reply.status(201).send({
      source: {
        id: source.id,
        projectId: source.projectId,
        name: source.name,
        role: source.role,
        service: source.service,
        provider: source.provider,
        lastEventAt: source.lastEventAt,
        createdAt: source.createdAt,
      },
      token: source.token,
      intakeUrl: `${intake}/v1/logs`,
      nextSteps: [
        `Set CALYX_INTAKE_URL=${intake}/v1/logs`,
        `Set CALYX_SOURCE_TOKEN=${source.token}`,
        `Send JSON events with Authorization: Bearer <token> (service defaults to "${source.service}")`,
      ],
      curlExample: `curl -X POST ${intake}/v1/logs \\\n  -H "Authorization: Bearer ${source.token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"timestamp":"${new Date().toISOString()}","service":"${source.service}","level":"info","message":"hello from ${source.role}","attributes":{}}'`,
    });
  });

  app.get("/v1/projects/:id/sources", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "sources:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const intake = intakeBaseUrl(request);
    const sources = await listLogSources(project.id);
    return reply.send({
      project,
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        service: s.service,
        provider: s.provider,
        lastEventAt: s.lastEventAt,
        createdAt: s.createdAt,
        status: s.lastEventAt ? "receiving" : "waiting",
        ...(s.provider === "vercel"
          ? { drainUrl: `${intake}/v1/drains/vercel/${s.id}` }
          : s.provider === "cloudwatch"
            ? { drainUrl: `${intake}/v1/drains/cloudwatch/${s.id}` }
            : {}),
      })),
    });
  });

  app.post("/v1/projects/:id/github", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "integrations:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const body = z
      .object({
        repo: z.string().min(3).regex(/^[\w.-]+\/[\w.-]+$/),
        installationId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: "Validation failed", issues: body.error.issues });
    }

    const conn = await upsertGithubConnection({
      projectId: project.id,
      tenantId: principal.tenantId,
      repo: body.data.repo,
      installationId: body.data.installationId,
    });

    const base = intakeBaseUrl(request);
    return reply.status(201).send({
      github: {
        repo: conn.repo,
        connectedAt: conn.connectedAt,
        installationId: conn.installationId,
      },
      webhookUrl: `${base}/v1/webhooks/github/${project.id}`,
      webhookSecret: conn.webhookSecret,
      nextSteps: [
        `In GitHub → ${conn.repo} → Settings → Webhooks → Add webhook`,
        `Payload URL: ${base}/v1/webhooks/github/${project.id}`,
        `Content type: application/json`,
        `Secret: (shown once above)`,
        `Events: Just the push event (and optionally deployment_status)`,
      ],
    });
  });

  app.post("/v1/projects/:id/slack", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "integrations:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const body = z
      .object({
        channelId: z.string().min(1),
        channelName: z.string().optional(),
        botToken: z.string().min(10),
        teamId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: "Validation failed", issues: body.error.issues });
    }

    const binding = await upsertSlackBinding({
      projectId: project.id,
      tenantId: principal.tenantId,
      channelId: body.data.channelId,
      channelName: body.data.channelName,
      botToken: body.data.botToken,
      teamId: body.data.teamId,
    });

    return reply.status(201).send({
      slack: {
        channelId: binding.channelId,
        channelName: binding.channelName,
        teamId: binding.teamId,
        connectedAt: binding.connectedAt,
      },
      nextSteps: [
        "Invite the Calyx bot to the channel",
        `Run: calyx slack test --project ${project.slug}`,
      ],
    });
  });

  app.post("/v1/projects/:id/slack/test", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "integrations:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const binding = await getSlackBinding(project.id);
    if (!binding) return reply.status(404).send({ error: "Slack not connected for this project" });

    const alert: Alert = {
      id: `test-${Date.now()}`,
      tenant_id: principal.tenantId,
      severity: "medium",
      impact: `Calyx onboarding test for **${project.name}**. Log sources and GitHub can now page this channel.`,
      root_cause: "Manual slack test from CLI / API",
      recommended_action: "No action needed — connection verified.",
      anomaly: {
        type: "error_spike",
        severity: "medium",
        tenant_id: principal.tenantId,
        service: project.slug,
        detected_at: new Date().toISOString(),
        evidence: {
          description: "Onboarding connectivity check",
          sample_event_ids: [],
        },
      },
      created_at: new Date().toISOString(),
    };

    const card = buildAlertCard(alert);
    const client = new WebClient(binding.botToken);
    try {
      const result = await client.chat.postMessage({
        channel: binding.channelId,
        text: card.text,
        attachments: [
          {
            color: card.color,
            blocks: card.blocks,
            fallback: card.text,
          },
        ],
      });
      return reply.send({ ok: true, ts: result.ts, channel: result.channel });
    } catch (err) {
      return reply.status(502).send({
        error: "Failed to post to Slack",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/v1/projects/:id", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "projects:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const [sources, github, slack] = await Promise.all([
      listLogSources(project.id),
      getGithubConnection(project.id),
      getSlackBinding(project.id),
    ]);

    return reply.send({
      project,
      sources: sources.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        role: s.role,
        service: s.service,
        provider: s.provider,
        lastEventAt: s.lastEventAt,
        createdAt: s.createdAt,
      })),
      github: github
        ? { repo: github.repo, connectedAt: github.connectedAt, installationId: github.installationId }
        : null,
      slack: slack
        ? {
            channelId: slack.channelId,
            channelName: slack.channelName,
            teamId: slack.teamId,
            connectedAt: slack.connectedAt,
          }
        : null,
    });
  });
}
