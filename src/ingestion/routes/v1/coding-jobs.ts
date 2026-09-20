import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCodingPullRequest,
  getRepositoryFile,
  searchRepositoryCode,
} from "../../../github/app.js";
import {
  authenticateCodingJobToken,
  claimCodingJobSubmission,
  completeCodingJobPullRequest,
  createCodingJob,
  failCodingJob,
  listCodingJobs,
} from "../../../storage/coding-jobs.js";
import {
  authenticateMgmtKey,
  bearerToken,
  requireScope,
} from "../../../mgmt/auth.js";
import { authorizeInternal } from "../../internal-auth.js";

const Launch = z.object({
  incidentId: z.string().uuid(),
  projectId: z.string().uuid(),
  objective: z.string().trim().min(1).max(4000),
  baseRef: z.string().trim().min(1).max(200).optional(),
});

const Submission = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().max(20_000).default(""),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        content: z.string().max(512 * 1024),
      }),
    )
    .min(1)
    .max(50),
});

export async function codingJobsRoute(app: FastifyInstance): Promise<void> {
  app.get("/v1/coding-jobs", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const principal = token ? await authenticateMgmtKey(token) : null;
    if (!principal)
      return reply.status(401).send({ error: "Invalid management token" });
    if (!requireScope(principal, "integrations:write"))
      return reply
        .status(403)
        .send({ error: "Missing scope integrations:write" });
    const parsed = z
      .object({ incidentId: z.string().uuid().optional() })
      .safeParse(request.query);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });
    return {
      jobs: await listCodingJobs(principal.tenantId, parsed.data.incidentId),
    };
  });

  app.post("/v1/coding-jobs", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const principal = token ? await authenticateMgmtKey(token) : null;
    if (!principal)
      return reply.status(401).send({ error: "Invalid management token" });
    if (!requireScope(principal, "integrations:write"))
      return reply
        .status(403)
        .send({ error: "Missing scope integrations:write" });
    const parsed = Launch.safeParse(request.body);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });

    const agentUrl = process.env.CALYX_CODING_AGENT_URL?.trim();
    const publicUrl = process.env.CALYX_PUBLIC_URL?.replace(/\/$/, "");
    if (!agentUrl || !publicUrl)
      return reply
        .status(503)
        .send({ error: "Coding agent dispatch is not configured" });
    const endpoint = new URL(agentUrl);
    if (
      process.env.NODE_ENV === "production" &&
      endpoint.protocol !== "https:"
    ) {
      return reply
        .status(503)
        .send({ error: "Production coding agent dispatch must use HTTPS" });
    }

    const rawActor = request.headers["x-calyx-actor-id"];
    const webActor = Array.isArray(rawActor) ? rawActor[0] : rawActor;
    if (webActor) {
      if (!authorizeInternal(request, reply)) return;
      if (!webActor.startsWith("web:") || webActor.length > 500) {
        return reply
          .status(422)
          .send({ error: "Invalid internal actor identity" });
      }
    }
    const actorId = webActor ?? `mgmt:${principal.credentialId}`;
    let created;
    try {
      created = await createCodingJob({
        tenantId: principal.tenantId,
        incidentId: parsed.data.incidentId,
        projectId: parsed.data.projectId,
        objective: parsed.data.objective,
        baseRef: parsed.data.baseRef,
        launchedBy: actorId,
      });
      const dispatch = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: created.job,
          callback: {
            url: `${publicUrl}/v1/coding-jobs/${created.job.id}/submit`,
            token: created.callbackToken,
          },
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!dispatch.ok)
        throw new Error(
          `Coding agent dispatch returned HTTP ${dispatch.status}`,
        );
      return reply.status(202).send({ job: created.job });
    } catch (error) {
      if (created) await failCodingJob(created.job.id, actorId, error);
      return reply.status(502).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/v1/coding-jobs/:jobId/files", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const token = bearerToken(request.headers.authorization);
    const job = token ? await authenticateCodingJobToken(jobId, token) : null;
    if (!job)
      return reply.status(401).send({ error: "Invalid coding job credential" });
    const parsed = z
      .object({
        path: z
          .string()
          .min(1)
          .max(500)
          .refine(
            (path) => !path.startsWith("/") && !path.split("/").includes(".."),
          ),
        ref: z.string().min(1).max(200).optional(),
      })
      .safeParse(request.query);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });
    try {
      return await getRepositoryFile({
        installationId: job.installationId,
        repo: job.repo,
        path: parsed.data.path,
        ref: parsed.data.ref ?? job.baseRef,
      });
    } catch (error) {
      return reply.status(502).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/v1/coding-jobs/:jobId/search", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const token = bearerToken(request.headers.authorization);
    const job = token ? await authenticateCodingJobToken(jobId, token) : null;
    if (!job)
      return reply.status(401).send({ error: "Invalid coding job credential" });
    const parsed = z
      .object({ q: z.string().trim().min(2).max(200) })
      .safeParse(request.query);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });
    try {
      return {
        results: await searchRepositoryCode({
          installationId: job.installationId,
          repo: job.repo,
          query: parsed.data.q,
        }),
      };
    } catch (error) {
      return reply.status(502).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/v1/coding-jobs/:jobId/submit", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const token = bearerToken(request.headers.authorization);
    const authenticated = token
      ? await authenticateCodingJobToken(jobId, token)
      : null;
    if (!authenticated)
      return reply.status(401).send({ error: "Invalid coding job credential" });
    const parsed = Submission.safeParse(request.body);
    if (!parsed.success)
      return reply.status(422).send({ error: parsed.error.flatten() });

    const actorId = `coding-agent:${jobId}`;
    const job = await claimCodingJobSubmission(jobId, actorId);
    if (!job)
      return reply
        .status(409)
        .send({ error: "Coding job is not accepting a submission" });
    try {
      const pull = await createCodingPullRequest({
        installationId: job.installationId,
        repo: job.repo,
        jobId: job.id,
        baseRef: job.baseRef,
        title: parsed.data.title,
        body: parsed.data.body,
        files: parsed.data.files,
      });
      const completed = await completeCodingJobPullRequest({
        jobId,
        actorId,
        branchName: pull.branchName,
        pullRequestNumber: pull.number,
        pullRequestUrl: pull.url,
      });
      return reply.status(201).send({ job: completed });
    } catch (error) {
      await failCodingJob(jobId, actorId, error);
      return reply.status(502).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
