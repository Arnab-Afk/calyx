import crypto from "node:crypto";
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
  deleteGithubConnection,
  deleteLogSource,
  deleteProject,
  getGithubConnection,
  getLogSourceById,
  getProject,
  getSlackBinding,
  listLogSources,
  listProjects,
  rotateLogSourceToken,
  upsertGithubConnection,
  upsertSlackBinding,
  type SourceRole,
} from "../../../storage/projects.js";
import { buildAlertCard } from "../../../slack/alert-card.js";
import type { Alert } from "../../../schemas/index.js";
import { WebClient } from "@slack/web-api";
import {
  consumeGithubInstallationState,
  createGithubInstallationState,
} from "../../../storage/github-installations.js";
import { listGithubProjectActivity } from "../../../storage/github.js";
import {
  listInstallationRepositories,
  backfillGithubRepositoryActivity,
  provisionGithubRepository,
  removeGithubRepositoryWebhook,
} from "../../../github/app.js";

function parseInstallationId(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/installations\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    const match = trimmed.match(/installations\/(\d+)/);
    return match?.[1] ?? null;
  }
}

async function finalizeGithubInstall(input: {
  tenantId: string;
  projectId: string;
  projectSlug: string;
  installationId: string;
  repo?: string;
  webhookUrl: string;
  /** When true and multiple repos, return the list instead of picking the first. */
  requireRepoPick?: boolean;
}): Promise<{ repo: string; installationId: string; connectedAt: string }> {
  let repo = input.repo?.trim() || "";
  if (!repo) {
    const repos = await listInstallationRepositories(input.installationId);
    if (repos.length === 0) {
      throw Object.assign(new Error("GitHub App installation has no repositories selected"), {
        statusCode: 409,
        repos: [] as string[],
      });
    }
    const preferred = repos.find(
      (r) => r.split("/")[1]?.toLowerCase() === input.projectSlug.toLowerCase(),
    );
    if (!preferred && repos.length > 1 && input.requireRepoPick) {
      throw Object.assign(new Error("Select a repository to connect"), {
        statusCode: 409,
        repos,
      });
    }
    repo = preferred ?? repos[0]!;
  }

  const webhookSecret = crypto.randomBytes(32).toString("hex");
  await provisionGithubRepository({
    installationId: input.installationId,
    repo,
    webhookUrl: input.webhookUrl,
    webhookSecret,
  });
  const connection = await upsertGithubConnection({
    projectId: input.projectId,
    tenantId: input.tenantId,
    repo,
    installationId: input.installationId,
    webhookSecret,
  });
  try {
    await backfillGithubRepositoryActivity({
      installationId: input.installationId,
      repo,
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
  } catch {
    // Webhook path still works even if historical backfill fails.
  }
  return {
    repo: connection.repo,
    installationId: connection.installationId ?? input.installationId,
    connectedAt: connection.connectedAt,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    mgmt?: MgmtPrincipal;
  }
}

async function requireMgmt(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: "projects:write" | "sources:write" | "integrations:write",
): Promise<MgmtPrincipal | null> {
  const token = bearerToken(request.headers.authorization);
  if (!token) {
    await reply
      .status(401)
      .send({ error: "Missing Authorization Bearer token" });
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
      return reply
        .status(422)
        .send({ error: "Validation failed", issues: body.error.issues });
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
        provider: z
          .enum(["http", "vercel", "cloudwatch"])
          .optional()
          .default("http"),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply
        .status(422)
        .send({ error: "Validation failed", issues: body.error.issues });
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

  app.post("/v1/projects/:id/sources/:sourceId/rotate", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "sources:write");
    if (!principal) return;

    const { id, sourceId } = request.params as { id: string; sourceId: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const existing = await getLogSourceById(sourceId);
    if (!existing || existing.projectId !== project.id) {
      return reply.status(404).send({ error: "Source not found" });
    }

    const source = await rotateLogSourceToken(sourceId, principal.tenantId);
    if (!source) return reply.status(404).send({ error: "Source not found" });

    const intake = intakeBaseUrl(request);
    return reply.send({
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
      note: "Previous token is revoked. Copy the new token now — it is shown once.",
    });
  });

  app.delete("/v1/projects/:id/sources/:sourceId", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "sources:write");
    if (!principal) return;

    const { id, sourceId } = request.params as { id: string; sourceId: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const existing = await getLogSourceById(sourceId);
    if (!existing || existing.projectId !== project.id) {
      return reply.status(404).send({ error: "Source not found" });
    }

    const deleted = await deleteLogSource(sourceId, principal.tenantId);
    if (!deleted) return reply.status(404).send({ error: "Source not found" });

    return reply.send({
      deleted: true,
      sourceId,
      note: "Source and API key removed. Previously ingested log events are kept.",
    });
  });

  app.delete("/v1/projects/:id", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "projects:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const deleted = await deleteProject(project.id, principal.tenantId);
    if (!deleted) return reply.status(404).send({ error: "Project not found" });

    return reply.send({
      deleted: true,
      projectId: project.id,
      slug: project.slug,
      note: "Project, sources, and integrations removed. Previously ingested log events are kept.",
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
        repo: z
          .string()
          .min(3)
          .regex(/^[\w.-]+\/[\w.-]+$/)
          .optional(),
        returnTo: z.string().url().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply
        .status(422)
        .send({ error: "Validation failed", issues: body.error.issues });
    }
    const slug = process.env.GITHUB_APP_SLUG?.trim();
    if (
      !slug ||
      !process.env.GITHUB_APP_ID ||
      !process.env.GITHUB_APP_PRIVATE_KEY
    ) {
      return reply
        .status(503)
        .send({ error: "GitHub App installation is not configured" });
    }
    const webBase = (process.env.CALYX_WEB_URL || process.env.WEB_APP_URL || "").replace(/\/$/, "");
    let returnTo = body.data.returnTo?.trim() || null;
    if (returnTo && webBase) {
      try {
        const u = new URL(returnTo);
        const allowed = new URL(webBase);
        if (u.origin !== allowed.origin) returnTo = null;
      } catch {
        returnTo = null;
      }
    }
    const repo = body.data.repo ?? "";
    const state = await createGithubInstallationState({
      tenantId: principal.tenantId,
      projectId: project.id,
      repo,
      returnTo,
    });
    return reply.status(201).send({
      repo: repo || null,
      installationUrl: `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`,
      expiresInSeconds: 600,
    });
  });

  app.get("/v1/projects/:id/github/activity", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "projects:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).optional(),
        sync: z
          .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
          .optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: "Validation failed", issues: query.error.issues });
    }

    const github = await getGithubConnection(project.id);
    const wantSync = query.data.sync === "1" || query.data.sync === "true";
    let synced: { commits: number; merges: number } | null = null;

    if (github?.installationId) {
      // Always attempt a light backfill when empty; force with ?sync=1.
      const existing = await listGithubProjectActivity({
        tenantId: principal.tenantId,
        projectId: project.id,
        limit: 1,
      });
      if (wantSync || existing.length === 0) {
        try {
          synced = await backfillGithubRepositoryActivity({
            installationId: github.installationId,
            repo: github.repo,
            tenantId: principal.tenantId,
            projectId: project.id,
          });
        } catch (error) {
          if (wantSync) {
            return reply.status(502).send({
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    const activity = await listGithubProjectActivity({
      tenantId: principal.tenantId,
      projectId: project.id,
      limit: query.data.limit ?? 80,
    });
    const counts = {
      push: activity.filter((a) => a.kind === "push").length,
      merge: activity.filter((a) => a.kind === "merge").length,
      pull_request: activity.filter((a) => a.kind === "pull_request").length,
      deploy: activity.filter((a) => a.kind === "deploy").length,
      total: activity.length,
    };
    return {
      repo: github?.repo ?? null,
      connected: Boolean(github),
      synced,
      counts,
      activity,
    };
  });

  // Complete link when GitHub left the user on settings/installations/:id (no Setup URL redirect).
  app.post("/v1/projects/:id/github/complete", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "integrations:write");
    if (!principal) return;

    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const body = z
      .object({
        installationId: z.string().min(1),
        repo: z
          .string()
          .min(3)
          .regex(/^[\w.-]+\/[\w.-]+$/)
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply
        .status(422)
        .send({ error: "Validation failed", issues: body.error.issues });
    }
    const installationId = parseInstallationId(body.data.installationId);
    if (!installationId) {
      return reply.status(422).send({
        error: "Pass a GitHub installation ID or settings URL like https://github.com/settings/installations/123",
      });
    }

    try {
      const connection = await finalizeGithubInstall({
        tenantId: principal.tenantId,
        projectId: project.id,
        projectSlug: project.slug,
        installationId,
        repo: body.data.repo,
        webhookUrl: `${intakeBaseUrl(request)}/v1/webhooks/github/${project.id}`,
        requireRepoPick: true,
      });
      return {
        connected: true,
        projectId: project.id,
        repo: connection.repo,
        installationId: connection.installationId,
        connectedAt: connection.connectedAt,
      };
    } catch (error) {
      const err = error as Error & { statusCode?: number; repos?: string[] };
      if (err.repos) {
        return reply.status(err.statusCode ?? 409).send({
          error: err.message,
          repos: err.repos,
          installationId,
        });
      }
      return reply
        .status(502)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/github/install/callback", async (request, reply) => {
    const webBase = (process.env.CALYX_WEB_URL || process.env.WEB_APP_URL || "").replace(/\/$/, "");
    const wantsHtml =
      !String(request.headers.accept || "").includes("application/json") ||
      String(request.headers.accept || "").includes("text/html");
    const redirectOrJson = (status: number, payload: Record<string, unknown>, dest?: string | null) => {
      if (wantsHtml && webBase) {
        const target = new URL(dest || `${webBase}/`);
        if (payload.error) target.searchParams.set("github", "error");
        else target.searchParams.set("github", "connected");
        for (const [k, v] of Object.entries(payload)) {
          if (k === "error" || k === "connected") continue;
          if (v == null) continue;
          target.searchParams.set(k, String(v));
        }
        if (payload.error) target.searchParams.set("message", String(payload.error));
        return reply.redirect(target.toString());
      }
      return reply.status(status).send(payload);
    };

    const parsed = z
      .object({
        state: z.string().min(60),
        installation_id: z.coerce.string().regex(/^\d+$/),
        setup_action: z.string().optional(),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return redirectOrJson(422, { error: "Invalid GitHub installation callback" });
    }
    if (parsed.data.setup_action === "delete") {
      return redirectOrJson(409, { error: "GitHub installation was removed" });
    }
    const state = await consumeGithubInstallationState(parsed.data.state);
    if (!state) {
      return redirectOrJson(409, {
        error: "GitHub installation state is invalid, expired, or already used",
      });
    }

    const webhookUrl = `${intakeBaseUrl(request)}/v1/webhooks/github/${state.projectId}`;
    try {
      const project = await getProject(state.tenantId, state.projectId);
      const connection = await finalizeGithubInstall({
        tenantId: state.tenantId,
        projectId: state.projectId,
        projectSlug: project?.slug || "",
        installationId: parsed.data.installation_id,
        repo: state.repo.trim() || undefined,
        webhookUrl,
      });
      return redirectOrJson(
        200,
        {
          connected: true,
          projectId: state.projectId,
          repo: connection.repo,
          installationId: connection.installationId,
        },
        state.returnTo || `${webBase}/?github=connected&repo=${encodeURIComponent(connection.repo)}`,
      );
    } catch (error) {
      return redirectOrJson(
        502,
        { error: error instanceof Error ? error.message : String(error) },
        state.returnTo,
      );
    }
  });

  app.delete("/v1/projects/:id/github", async (request, reply) => {
    const principal = await requireMgmt(request, reply, "integrations:write");
    if (!principal) return;
    const { id } = request.params as { id: string };
    const project = await getProject(principal.tenantId, id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const connection = await getGithubConnection(project.id);
    if (!connection)
      return reply.status(404).send({ error: "GitHub is not connected" });
    let warning: string | undefined;
    if (connection.installationId) {
      try {
        await removeGithubRepositoryWebhook({
          installationId: connection.installationId,
          repo: connection.repo,
          webhookUrl: `${intakeBaseUrl(request)}/v1/webhooks/github/${project.id}`,
        });
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    }
    await deleteGithubConnection(project.id, principal.tenantId);
    return { disconnected: true, ...(warning && { warning }) };
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
        /** Optional — defaults to SLACK_BOT_TOKEN from the server env (no browser paste). */
        botToken: z.string().min(10).optional(),
        teamId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply
        .status(422)
        .send({ error: "Validation failed", issues: body.error.issues });
    }

    const botToken =
      body.data.botToken?.trim() || process.env.SLACK_BOT_TOKEN?.trim();
    if (!botToken) {
      return reply.status(503).send({
        error:
          "Slack bot is not configured on the server (set SLACK_BOT_TOKEN)",
      });
    }

    const binding = await upsertSlackBinding({
      projectId: project.id,
      tenantId: principal.tenantId,
      channelId: body.data.channelId,
      channelName: body.data.channelName,
      botToken,
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
        "Use Test in Settings → Integrations, or POST .../slack/test",
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
    if (!binding)
      return reply
        .status(404)
        .send({ error: "Slack not connected for this project" });

    const botToken =
      binding.botToken?.trim() || process.env.SLACK_BOT_TOKEN?.trim();
    if (!botToken) {
      return reply.status(503).send({
        error:
          "Slack bot is not configured on the server (set SLACK_BOT_TOKEN)",
      });
    }

    const alert: Alert = {
      id: `test-${Date.now()}`,
      tenant_id: principal.tenantId,
      severity: "medium",
      impact: `Calyx onboarding test for **${project.name}**. Log sources and GitHub can now page this channel.`,
      root_cause: "Manual slack test from Settings / API",
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
    const client = new WebClient(botToken);
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
        ? {
            repo: github.repo,
            connectedAt: github.connectedAt,
            installationId: github.installationId,
          }
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
