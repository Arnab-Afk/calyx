import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorizeInternal } from "../../internal-auth.js";
import { createMgmtKey } from "../../../mgmt/auth.js";
import { tenantForWorkspace } from "../../../storage/workspace-tenants.js";
import {
  approveDeviceSession,
  consumeDeviceSession,
  createDeviceSession,
  getDeviceSessionByDeviceCode,
  getDeviceSessionByUserCode,
  markExpiredDeviceSessions,
} from "../../../storage/cli-device.js";

function webAppUrl(): string {
  return (
    process.env.CALYX_WEB_URL ||
    process.env.WEB_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://calyx.arnabbhowmik.in"
  ).replace(/\/$/, "");
}

function intakePublicUrl(requestHost?: string): string {
  const configured = (
    process.env.CALYX_PUBLIC_INTAKE_URL ||
    process.env.CALYX_PUBLIC_URL ||
    process.env.CALYX_INTAKE_URL ||
    ""
  ).replace(/\/$/, "");
  if (configured) return configured;
  if (requestHost && !requestHost.includes("127.0.0.1") && !requestHost.startsWith("localhost")) {
    return `https://${requestHost}`;
  }
  return "https://calyx-intake.arnabbhowmik.in";
}

export async function cliDeviceRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/cli/device/code", async (request) => {
    await markExpiredDeviceSessions();
    const session = await createDeviceSession();
    const verificationUri = `${webAppUrl()}/cli/device`;
    const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(session.userCode)}`;
    return {
      device_code: session.deviceCode,
      user_code: session.userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: Math.max(
        1,
        Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
      ),
      interval: 3,
    };
  });

  app.get("/v1/cli/device/poll", async (request, reply) => {
    const q = z
      .object({ device_code: z.string().min(16).max(128) })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(422).send({ error: "device_code required" });
    }

    await markExpiredDeviceSessions();
    const existing = await getDeviceSessionByDeviceCode(q.data.device_code);
    if (!existing) {
      return reply.status(404).send({ error: "unknown_device_code", status: "expired" });
    }

    if (existing.status === "pending") {
      if (new Date(existing.expiresAt).getTime() <= Date.now()) {
        return { status: "expired" };
      }
      return { status: "pending" };
    }

    if (existing.status === "expired" || existing.status === "consumed") {
      return { status: existing.status };
    }

    // approved → consume once and hand token to CLI
    const consumed = await consumeDeviceSession(q.data.device_code);
    if (!consumed?.mgmtToken) {
      return { status: "consumed" };
    }

    const host = request.headers.host;
    return {
      status: "approved",
      api_token: consumed.mgmtToken,
      api_url: intakePublicUrl(typeof host === "string" ? host : undefined),
      tenant_id: consumed.tenantId,
      workspace_id: consumed.workspaceId,
    };
  });

  // Lookup for the web authorize page (public, no secrets).
  app.get("/v1/cli/device/lookup", async (request, reply) => {
    const q = z
      .object({ user_code: z.string().min(4).max(16) })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(422).send({ error: "user_code required" });
    }
    await markExpiredDeviceSessions();
    const session = await getDeviceSessionByUserCode(q.data.user_code);
    if (!session) return reply.status(404).send({ error: "unknown_user_code" });
    if (session.status !== "pending" || new Date(session.expiresAt).getTime() <= Date.now()) {
      return reply.status(410).send({ error: "code_expired", status: session.status });
    }
    return {
      user_code: session.userCode,
      status: session.status,
      expires_at: session.expiresAt,
    };
  });

  app.post("/v1/internal/cli/device/approve", async (request, reply) => {
    if (!authorizeInternal(request, reply)) return;
    const body = z
      .object({
        user_code: z.string().min(4).max(16),
        workspace_id: z.string().min(1).max(120),
        actor_id: z.string().min(1).max(200).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(422).send({ error: body.error.flatten() });
    }

    const tenantId = await tenantForWorkspace(body.data.workspace_id);
    if (!tenantId) {
      return reply.status(404).send({ error: "Workspace is not linked to a Calyx tenant" });
    }

    const session = await getDeviceSessionByUserCode(body.data.user_code);
    if (!session || session.status !== "pending") {
      return reply.status(410).send({ error: "Code is not pending or already used" });
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return reply.status(410).send({ error: "Code expired" });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d CLI key
    const key = await createMgmtKey({
      tenantId,
      name: `cli-device:${body.data.workspace_id}:${body.data.actor_id ?? "user"}`.slice(0, 120),
      expiresAt,
    });

    const approved = await approveDeviceSession({
      userCode: body.data.user_code,
      workspaceId: body.data.workspace_id,
      tenantId,
      mgmtToken: key.token,
      credentialId: key.credentialId,
    });
    if (!approved) {
      return reply.status(409).send({ error: "Could not approve device session" });
    }

    return {
      approved: true,
      workspace_id: body.data.workspace_id,
      tenant_id: tenantId,
      expires_at: approved.expiresAt,
    };
  });
}
